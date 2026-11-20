const ADJ = ['Lucky', 'Velvet', 'Neon', 'Midnight', 'Golden', 'Brass', 'Silver', 'Cosmic', 'Smooth', 'Wild', 'Quiet', 'Rowdy', 'Electric', 'Dapper', 'Sly'];
const NOUN = ['Otter', 'Falcon', 'Fox', 'Heron', 'Lynx', 'Moth', 'Panda', 'Raven', 'Tiger', 'Viper', 'Badger', 'Comet', 'Jackal', 'Mako', 'Owl'];

export function randomName(): string {
  const r = (n: number) => Math.floor(Math.random() * n);
  return `${ADJ[r(ADJ.length)]}${NOUN[r(NOUN.length)]}${10 + r(90)}`;
}
