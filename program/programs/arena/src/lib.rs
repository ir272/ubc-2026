//! Arena: pooled (parimutuel) play-money markets with 2..=16 outcomes.
//!
//! PDAs
//!   config   = ["config"]
//!   mint     = ["mint"]            PLAY, 6 decimals, mint authority = admin
//!   vault    = ["vault"]           token account (mint = PLAY, authority = config) holding every pool
//!   market   = ["market", id u64 le]
//!   position = ["pos", market, owner]
//!
//! Rent reclamation (admin only): `close_position` closes a claimed Position, `close_market` closes a
//! Settled/Void Market once every Position on it has been closed. `Market.positions` counts the
//! Position accounts that still exist, so a market can never be closed while a claim still needs it.
use anchor_lang::prelude::*;
use solana_sha256_hasher::hash as sha256;
use anchor_lang::solana_program::sysvar::slot_hashes;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("GGQeGU8BTtRDmHPoC25Py185wEuUeDz3phXWG4Gp6z2P");

pub const MAX_OUTCOMES: usize = 16;
pub const PLAY_DECIMALS: u8 = 6;
/// Number of entries the SlotHashes sysvar keeps.
const SLOT_HASHES_MAX: usize = 512;

#[program]
pub mod arena {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let c = &mut ctx.accounts.config;
        c.admin = ctx.accounts.admin.key();
        c.mint = ctx.accounts.mint.key();
        c.vault = ctx.accounts.vault.key();
        c.bump = ctx.bumps.config;
        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    pub fn create_market(
        ctx: Context<CreateMarket>,
        id: u64,
        channel: [u8; 16],
        outcome_count: u8,
        close_slot: u64,
        settle_deadline_slot: u64,
        commitment: [u8; 32],
        sim_hash: [u8; 32],
    ) -> Result<()> {
        require!(
            (2..=MAX_OUTCOMES as u8).contains(&outcome_count),
            ArenaError::BadOutcomeCount
        );
        require!(settle_deadline_slot > close_slot, ArenaError::BadDeadline);
        let m = &mut ctx.accounts.market;
        m.id = id;
        m.channel = channel;
        m.outcome_count = outcome_count;
        m.pools = [0; MAX_OUTCOMES];
        m.state = MarketState::Open;
        m.close_slot = close_slot;
        m.settle_deadline_slot = settle_deadline_slot;
        m.commitment = commitment;
        m.entropy = [0; 32];
        m.secret = [0; 32];
        m.sim_hash = sim_hash;
        m.winner = 0;
        m.entropy_slot = 0;
        m.bump = ctx.bumps.market;
        m.positions = 0;
        Ok(())
    }

    pub fn place_bet(ctx: Context<PlaceBet>, outcome: u8, amount: u64) -> Result<()> {
        let slot = Clock::get()?.slot;
        let m = &mut ctx.accounts.market;
        require!(m.state == MarketState::Open, ArenaError::NotOpen);
        require!(slot < m.close_slot, ArenaError::BettingClosed);
        require!(outcome < m.outcome_count, ArenaError::BadOutcome);
        require!(amount > 0, ArenaError::ZeroAmount);

        let o = outcome as usize;
        m.pools[o] = m.pools[o].checked_add(amount).ok_or(ArenaError::Overflow)?;
        // keep the total representable as u64
        m.pools
            .iter()
            .try_fold(0u64, |a, p| a.checked_add(*p))
            .ok_or(ArenaError::Overflow)?;

        let p = &mut ctx.accounts.position;
        if p.owner == Pubkey::default() {
            p.market = m.key();
            p.owner = ctx.accounts.owner.key();
            p.bump = ctx.bumps.position;
            m.positions = m.positions.checked_add(1).ok_or(ArenaError::Overflow)?;
        }
        p.amounts[o] = p.amounts[o].checked_add(amount).ok_or(ArenaError::Overflow)?;

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.owner_token.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            amount,
        )
    }

    pub fn lock(ctx: Context<Lock>) -> Result<()> {
        let slot = Clock::get()?.slot;
        let m = &mut ctx.accounts.market;
        require!(m.state == MarketState::Open, ArenaError::NotOpen);
        require!(slot > m.close_slot, ArenaError::TooEarly);

        // SlotHashes raw layout: u64 len, then len * (u64 slot, [u8;32] hash), newest first.
        // Read the bytes directly; deserializing all 512 entries would blow the heap/compute.
        let data = ctx.accounts.slot_hashes.try_borrow_data()?;
        require!(data.len() >= 8, ArenaError::EntropyUnavailable);
        let len = u64::from_le_bytes(data[0..8].try_into().unwrap()) as usize;
        let len = len.min((data.len() - 8) / 40);
        let mut found: Option<(u64, [u8; 32])> = None;
        let mut saw_older = false;
        for i in 0..len {
            let off = 8 + i * 40;
            let s = u64::from_le_bytes(data[off..off + 8].try_into().unwrap());
            if s >= m.close_slot {
                let mut h = [0u8; 32];
                h.copy_from_slice(&data[off + 8..off + 40]);
                found = Some((s, h));
            } else {
                saw_older = true;
                break;
            }
        }
        let (s, h) = found.ok_or(ArenaError::EntropyUnavailable)?;
        // If every remaining entry is newer than close_slot and the sysvar is full, the
        // true first slot at/after close_slot may have aged out: refuse (market gets voided).
        require!(saw_older || len < SLOT_HASHES_MAX, ArenaError::EntropyExpired);

        m.entropy = h;
        m.entropy_slot = s;
        m.state = MarketState::Locked;
        Ok(())
    }

    pub fn settle(ctx: Context<Settle>, secret: [u8; 32], winner: u8) -> Result<()> {
        let m = &mut ctx.accounts.market;
        require!(m.state == MarketState::Locked, ArenaError::NotLocked);
        require!(winner < m.outcome_count, ArenaError::BadOutcome);
        if m.commitment != [0u8; 32] {
            require!(
                sha256(&secret).to_bytes() == m.commitment,
                ArenaError::BadSecret
            );
        }
        m.secret = secret;
        m.winner = winner;
        m.state = MarketState::Settled;
        Ok(())
    }

    pub fn void(ctx: Context<Void>) -> Result<()> {
        let slot = Clock::get()?.slot;
        let m = &mut ctx.accounts.market;
        require!(
            m.state == MarketState::Open || m.state == MarketState::Locked,
            ArenaError::AlreadyFinal
        );
        if ctx.accounts.authority.key() != ctx.accounts.config.admin {
            require!(slot > m.settle_deadline_slot, ArenaError::Unauthorized);
        }
        m.state = MarketState::Void;
        Ok(())
    }

    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        let m = &ctx.accounts.market;
        let p = &mut ctx.accounts.position;
        require!(!p.claimed, ArenaError::AlreadyClaimed);

        let staked: u128 = p.amounts.iter().map(|a| *a as u128).sum();
        let payout: u128 = match m.state {
            MarketState::Void => staked,
            MarketState::Settled => {
                let w = m.winner as usize;
                let pool_w = m.pools[w] as u128;
                if pool_w == 0 {
                    staked
                } else {
                    let total: u128 = m.pools.iter().map(|a| *a as u128).sum();
                    (p.amounts[w] as u128)
                        .checked_mul(total)
                        .ok_or(ArenaError::Overflow)?
                        / pool_w
                }
            }
            _ => return err!(ArenaError::NotFinal),
        };
        let payout = u64::try_from(payout).map_err(|_| ArenaError::Overflow)?;
        p.claimed = true;

        if payout > 0 {
            let seeds: &[&[u8]] = &[b"config", &[ctx.accounts.config.bump]];
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.vault.to_account_info(),
                        to: ctx.accounts.owner_token.to_account_info(),
                        authority: ctx.accounts.config.to_account_info(),
                    },
                    &[seeds],
                ),
                payout,
            )?;
        }
        emit!(Claimed {
            market: m.key(),
            owner: p.owner,
            amount: payout
        });
        Ok(())
    }

    /// Admin: closes a claimed Position; its rent goes to the admin.
    pub fn close_position(ctx: Context<ClosePosition>) -> Result<()> {
        require!(ctx.accounts.position.claimed, ArenaError::NotClaimed);
        let m = &mut ctx.accounts.market;
        m.positions = m.positions.checked_sub(1).ok_or(ArenaError::Overflow)?;
        Ok(())
    }

    /// Admin: closes a Settled or Void Market with no Position left; its rent goes to the admin.
    pub fn close_market(ctx: Context<CloseMarket>) -> Result<()> {
        let m = &ctx.accounts.market;
        require!(
            m.state == MarketState::Settled || m.state == MarketState::Void,
            ArenaError::NotFinal
        );
        require!(m.positions == 0, ArenaError::PositionsOpen);
        Ok(())
    }
}

// ---------------------------------------------------------------- accounts

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    pub mint: Pubkey,
    pub vault: Pubkey,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum MarketState {
    Open,
    Locked,
    Settled,
    Void,
}

#[account]
#[derive(InitSpace)]
pub struct Market {
    pub id: u64,
    pub channel: [u8; 16],
    pub outcome_count: u8,
    pub pools: [u64; 16],
    pub state: MarketState,
    pub close_slot: u64,
    pub settle_deadline_slot: u64,
    pub commitment: [u8; 32],
    pub entropy: [u8; 32],
    pub secret: [u8; 32],
    pub sim_hash: [u8; 32],
    pub winner: u8,
    /// The slot whose hash became `entropy` (0 until locked).
    pub entropy_slot: u64,
    pub bump: u8,
    /// Position accounts on this market that still exist (+1 on a first bet, -1 on close_position).
    pub positions: u32,
}

#[account]
#[derive(InitSpace)]
pub struct Position {
    pub market: Pubkey,
    pub owner: Pubkey,
    pub amounts: [u64; 16],
    pub claimed: bool,
    pub bump: u8,
}

#[event]
pub struct Claimed {
    pub market: Pubkey,
    pub owner: Pubkey,
    pub amount: u64,
}

// ---------------------------------------------------------------- contexts

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(init, payer = admin, space = 8 + Config::INIT_SPACE, seeds = [b"config"], bump)]
    pub config: Account<'info, Config>,
    #[account(
        init, payer = admin, seeds = [b"mint"], bump,
        mint::decimals = PLAY_DECIMALS, mint::authority = admin
    )]
    pub mint: Account<'info, Mint>,
    #[account(
        init, payer = admin, seeds = [b"vault"], bump,
        token::mint = mint, token::authority = config
    )]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(id: u64)]
pub struct CreateMarket<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump, has_one = admin @ ArenaError::Unauthorized)]
    pub config: Account<'info, Config>,
    #[account(
        init, payer = admin, space = 8 + Market::INIT_SPACE,
        seeds = [b"market", id.to_le_bytes().as_ref()], bump
    )]
    pub market: Account<'info, Market>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PlaceBet<'info> {
    pub owner: Signer<'info>,
    /// Pays rent for the position on first bet (usually the relayer / fee payer).
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [b"market", market.id.to_le_bytes().as_ref()], bump = market.bump)]
    pub market: Account<'info, Market>,
    #[account(
        init_if_needed, payer = payer, space = 8 + Position::INIT_SPACE,
        seeds = [b"pos", market.key().as_ref(), owner.key().as_ref()], bump
    )]
    pub position: Account<'info, Position>,
    #[account(mut, token::mint = config.mint, token::authority = owner)]
    pub owner_token: Account<'info, TokenAccount>,
    #[account(mut, address = config.vault)]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Lock<'info> {
    #[account(mut, seeds = [b"market", market.id.to_le_bytes().as_ref()], bump = market.bump)]
    pub market: Account<'info, Market>,
    /// CHECK: SlotHashes sysvar, read raw.
    #[account(address = slot_hashes::ID)]
    pub slot_hashes: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct Settle<'info> {
    pub admin: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump, has_one = admin @ ArenaError::Unauthorized)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [b"market", market.id.to_le_bytes().as_ref()], bump = market.bump)]
    pub market: Account<'info, Market>,
}

#[derive(Accounts)]
pub struct Void<'info> {
    /// Admin any time before settle; anyone after `settle_deadline_slot`.
    pub authority: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [b"market", market.id.to_le_bytes().as_ref()], bump = market.bump)]
    pub market: Account<'info, Market>,
}

#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(seeds = [b"market", market.id.to_le_bytes().as_ref()], bump = market.bump)]
    pub market: Account<'info, Market>,
    /// CHECK: only used as a key; the payout always goes to this owner.
    pub owner: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [b"pos", market.key().as_ref(), owner.key().as_ref()], bump = position.bump,
        has_one = market, has_one = owner
    )]
    pub position: Account<'info, Position>,
    #[account(mut, token::mint = config.mint, token::authority = owner)]
    pub owner_token: Account<'info, TokenAccount>,
    #[account(mut, address = config.vault)]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ClosePosition<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump, has_one = admin @ ArenaError::Unauthorized)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [b"market", market.id.to_le_bytes().as_ref()], bump = market.bump)]
    pub market: Account<'info, Market>,
    #[account(
        mut, close = admin, has_one = market,
        seeds = [b"pos", market.key().as_ref(), position.owner.as_ref()], bump = position.bump
    )]
    pub position: Account<'info, Position>,
}

#[derive(Accounts)]
pub struct CloseMarket<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump, has_one = admin @ ArenaError::Unauthorized)]
    pub config: Account<'info, Config>,
    #[account(mut, close = admin, seeds = [b"market", market.id.to_le_bytes().as_ref()], bump = market.bump)]
    pub market: Account<'info, Market>,
}

#[error_code]
pub enum ArenaError {
    #[msg("outcome_count must be 2..=16")]
    BadOutcomeCount,
    #[msg("settle_deadline_slot must be after close_slot")]
    BadDeadline,
    #[msg("market is not open")]
    NotOpen,
    #[msg("betting is closed (slot >= close_slot)")]
    BettingClosed,
    #[msg("outcome out of range")]
    BadOutcome,
    #[msg("amount must be > 0")]
    ZeroAmount,
    #[msg("arithmetic overflow")]
    Overflow,
    #[msg("close_slot has not passed yet")]
    TooEarly,
    #[msg("no slot hash at or after close_slot is available yet")]
    EntropyUnavailable,
    #[msg("the slot hash for close_slot has aged out of SlotHashes; void the market")]
    EntropyExpired,
    #[msg("market is not locked")]
    NotLocked,
    #[msg("sha256(secret) does not match commitment")]
    BadSecret,
    #[msg("market is already settled or void")]
    AlreadyFinal,
    #[msg("unauthorized")]
    Unauthorized,
    #[msg("market is neither settled nor void")]
    NotFinal,
    #[msg("position already claimed")]
    AlreadyClaimed,
    #[msg("position has not been claimed yet")]
    NotClaimed,
    #[msg("market still has positions; close them first")]
    PositionsOpen,
}
