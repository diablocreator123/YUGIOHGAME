export const CHAKRA_TYPES = ["taijutsu", "ninjutsu", "genjutsu", "bloodline"];

export const CHAKRA_LABELS = {
  taijutsu: "Taijutsu",
  ninjutsu: "Ninjutsu",
  genjutsu: "Genjutsu",
  bloodline: "Bloodline",
  random: "Random",
};

const status = (id, duration, extra = {}) => ({ type: "status", id, duration, ...extra });
const damage = (amount, extra = {}) => ({ type: "damage", amount, ...extra });
const heal = (amount) => ({ type: "heal", amount });

// These data definitions are original implementations of the user-supplied alpha rules.
export const CHARACTER_DATA = {
  naruto: {
    id: "naruto",
    name: "Naruto",
    maxHp: 100,
    skills: [
      {
        id: "naruto-combo",
        name: "Uzumaki Naruto Combo",
        description: "Deal 20 damage, or 30 while Shadow Clones is active.",
        target: "enemy",
        cost: { taijutsu: 1 },
        cooldown: 0,
        effects: [damage(20, { bonusIfCasterHas: "shadow-clones", bonus: 10 })],
      },
      {
        id: "rasengan",
        name: "Rasengan",
        description: "Deal 45 damage and stun for 1 turn. Requires Shadow Clones.",
        target: "enemy",
        cost: { ninjutsu: 1 },
        cooldown: 1,
        prerequisites: [{ casterHas: "shadow-clones" }],
        effects: [damage(45), status("stun", 1, { harmful: true })],
      },
      {
        id: "shadow-clones",
        name: "Shadow Clones",
        description: "Self only. Gain 15 damage reduction for 4 turns and unlock Rasengan.",
        target: "self",
        cost: { random: 1 },
        cooldown: 3,
        effects: [
          status("shadow-clones", 4, { damageReduction: 15 }),
        ],
      },
      {
        id: "sexy-technique",
        name: "Sexy Technique",
        description: "Self only. Become invulnerable for 1 turn.",
        target: "self",
        cost: { genjutsu: 1 },
        cooldown: 4,
        effects: [status("invulnerable", 1, { defense: true })],
      },
    ],
  },
  sasuke: {
    id: "sasuke",
    name: "Sasuke",
    maxHp: 100,
    skills: [
      {
        id: "lion-combo",
        name: "Lion Combo",
        description: "Deal 30 damage, or 45 to an enemy marked by Sharingan.",
        target: "enemy",
        cost: {},
        cooldown: 0,
        effects: [damage(30, { bonusIfTargetHas: "sharingan-mark", bonus: 15 })],
      },
      {
        id: "chidori",
        name: "Chidori",
        description: "Deal 35 piercing damage, or 60 to a Sharingan-marked enemy.",
        target: "enemy",
        cost: { ninjutsu: 1 },
        cooldown: 1,
        effects: [damage(35, { piercing: true, bonusIfTargetHas: "sharingan-mark", bonus: 25 })],
      },
      {
        id: "sharingan",
        name: "Sharingan",
        description: "Mark an enemy for 4 turns and gain 15 damage reduction for 4 turns.",
        target: "enemy",
        cost: { bloodline: 1 },
        cooldown: 4,
        effects: [
          status("sharingan-mark", 4, { harmful: true, bypassDefenses: true }),
          { type: "status", target: "caster", id: "sharingan-guard", duration: 4, damageReduction: 15 },
        ],
      },
      {
        id: "swift-block",
        name: "Swift Block",
        description: "Self only. Become invulnerable for 1 turn.",
        target: "self",
        cost: { genjutsu: 1 },
        cooldown: 4,
        effects: [status("invulnerable", 1, { defense: true })],
      },
    ],
  },
  sakura: {
    id: "sakura",
    name: "Sakura",
    maxHp: 100,
    skills: [
      {
        id: "ko-punch",
        name: "KO Punch",
        description: "Deal 20 damage and stun for 1 turn; deal 30 during Inner Sakura.",
        target: "enemy",
        cost: { taijutsu: 1 },
        cooldown: 0,
        effects: [damage(20, { bonusIfCasterHas: "inner-sakura", bonus: 10 }), status("stun", 1, { harmful: true })],
      },
      {
        id: "mystical-palm",
        name: "Mystical Palm Healing",
        description: "Restore 25 HP to a living ally, including Sakura.",
        target: "ally",
        cost: { ninjutsu: 1 },
        cooldown: 0,
        effects: [heal(25)],
      },
      {
        id: "inner-sakura",
        name: "Inner Sakura",
        description: "Self only. Gain 10 damage reduction and ignore harmful non-damage effects for 4 turns.",
        target: "self",
        cost: { genjutsu: 1 },
        cooldown: 4,
        effects: [status("inner-sakura", 4, { damageReduction: 10, ignoreHarmfulNonDamage: true })],
      },
      {
        id: "sakura-replacement",
        name: "Sakura Replacement Technique",
        description: "Self only. Become invulnerable for 1 turn.",
        target: "self",
        cost: { bloodline: 1 },
        cooldown: 4,
        effects: [status("invulnerable", 1, { defense: true })],
      },
    ],
  },
};
