// Kit test figure (not a candidate): shows how a character file is laid out.
(function () {
  const { smooth, ell, limb, arc } = Ink;
  CAST.push({
    id: 'demo', group: 'demo', name: 'Kit test', kind: 'Example file', look: 'A hooded figure with a staff, to prove the pen.',
    does: [['Bolt', 'A line of fire from the staff.']],
    draw(ink, pose) {
      const cast = pose === 'ability';
      // joints (local space: feet on y = 0, up is -y, facing +x)
      const hip = [0, -92], neck = [6, -160], head = [10, -182];
      const footB = [-18, 0], footF = [22, 0];
      const handF = cast ? [70, -150] : [34, -104], handB = [-22, -100];
      const staffTop = cast ? [96, -214] : [44, -218], staffBot = cast ? [52, -98] : [30, 0];
      // back arm, then the robe, then the front arm over it
      ink.form(limb([-6, -150], handB, 9, 6));
      const robe = smooth([[-16, -158], [-30, -100], [-44, -30], [-50, 0], [44, 0], [34, -40], [28, -100], [24, -156]], 6, true);
      ink.form(robe);
      ink.hatch(smooth([[-16, -150], [-30, -100], [-44, -30], [-48, -2], [-20, -2], [-12, -80]], 5, true), { angle: 1.25, gap: 5 });
      ink.cut(smooth([[4, -120], [-2, -60], [6, -4]], 6));
      ink.cut(smooth([[18, -110], [20, -50], [28, -4]], 6));
      ink.form(smooth([[-22, -108], [0, -102], [26, -110], [26, -98], [0, -90], [-22, -96]], 5, true), { tint: 'gold' });
      // hood
      ink.form(smooth([[-14, -160], [-18, -190], [2, -214], [26, -196], [28, -170], [14, -156]], 6, true));
      ink.mask(ell(14, -180, 9, 12, 0.1));
      ink.cut(ell(14, -180, 9, 12, 0.1), { closed: true, w: 1.4 });
      ink.dot(17, -182, 1.8, { free: true });
      // staff and the hand on it
      ink.line([staffBot, staffTop], { w: 3.2, taper: 0.15 });
      ink.line(arc(staffTop[0], staffTop[1] - 8, 8, 0.6, 5.6, 12), { w: 2 });
      ink.form(limb([16, -150], handF, 9, 6));
      ink.form(ell(handF[0], handF[1], 6, 6));
      if (cast) {
        const o = [staffTop[0] + 8, staffTop[1] - 8];
        for (let i = 0; i < 5; i++) ink.line(smooth([[o[0] + 10, o[1] + i * 3 - 6], [o[0] + 70, o[1] - 20 + i * 12], [o[0] + 150 + i * 6, o[1] - 6 + i * 9]], 6), { tint: 'gold', w: 2.2 - i * 0.2, taper: 0.9 });
      }
    },
  });
})();
