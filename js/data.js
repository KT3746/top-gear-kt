export const CARS = [
  {
    id: "fenix",
    name: "Fênix R",
    tag: "Equilíbrio. Perdoa erro e ainda chega.",
    color: "#9b1b1b",
    accent: "#c5c8ce",
    silhouette: "gt",
    top: 286,
    accel: 1.0,
    grip: 1.05,
    nitro: 1.0,
    fuel: 1.0,
  },
  {
    id: "gaviao",
    name: "Gavião",
    tag: "Cola no chão. Curva como se fosse trilho.",
    color: "#14382e",
    accent: "#8a9aa3",
    silhouette: "wide",
    top: 268,
    accel: 0.92,
    grip: 1.32,
    nitro: 0.9,
    fuel: 1.12,
  },
  {
    id: "cometa",
    name: "Cometa",
    tag: "Reta é o recado. Segura nas curvas.",
    color: "#cfc8b8",
    accent: "#8a6a16",
    silhouette: "long",
    top: 318,
    accel: 1.12,
    grip: 0.78,
    nitro: 1.02,
    fuel: 0.86,
  },
  {
    id: "sombra",
    name: "Sombra",
    tag: "Arranque e nitro. Sai na frente e some.",
    color: "#1a1e2c",
    accent: "#6e7c90",
    silhouette: "box",
    top: 274,
    accel: 1.28,
    grip: 0.96,
    nitro: 1.42,
    fuel: 0.94,
  },
];

export const DRIVERS = [
  { id: "you", name: "Você", human: true },
  { id: "rico", name: "Rico Mendes", skill: 0.94, nerve: 0.82 },
  { id: "lila", name: "Lila Costa", skill: 0.97, nerve: 0.7 },
  { id: "kenji", name: "Kenji Arai", skill: 0.9, nerve: 0.95 },
  { id: "bia", name: "Bia Prado", skill: 0.84, nerve: 0.68 },
  { id: "omar", name: "Omar Dias", skill: 0.8, nerve: 0.74 },
  { id: "tess", name: "Tess Vieira", skill: 0.86, nerve: 0.6 },
  { id: "nico", name: "Nico Bel", skill: 0.78, nerve: 0.88 },
];

export const UPGRADES = {
  engine: {
    name: "Motor",
    blurb: "Sobe mais rápido e alcança mais no fim da reta.",
    costs: [280, 700, 1400],
    max: 3,
  },
  tires: {
    name: "Pneus",
    blurb: "Menos derrapada e menos castigo fora da pista.",
    costs: [220, 650, 1200],
    max: 3,
  },
  nitro: {
    name: "Nitro",
    blurb: "Cada rajada dura um pouco mais. Ainda são poucas por corrida.",
    costs: [260, 720, 1350],
    max: 3,
  },
};

export const PRIZE = [800, 520, 340, 220, 120, 80, 50, 30];
export const POINTS = [10, 8, 6, 4, 2, 1, 0, 0];
export const QUALIFY = 4;

const EASY = 2.2;
const MED = 3.8;
const HARD = 5.2;
const HILL_S = 16;
const HILL_M = 34;
const HILL_L = 56;

function recipePraia() {
  return [
    ["straight", 40],
    ["curve", 30, EASY, 0],
    ["straight", 20],
    ["hill", 24, HILL_S],
    ["curve", 36, -MED, HILL_S],
    ["straight", 28],
    ["scurve", 22, EASY],
    ["straight", 18],
    ["curve", 40, HARD, 0],
    ["straight", 32],
    ["hill", 20, -HILL_S],
    ["curve", 28, -EASY, 0],
    ["straight", 36],
  ];
}

function recipeAlpes() {
  return [
    ["straight", 18],
    ["hill", 30, HILL_L],
    ["curve", 34, MED, -HILL_M],
    ["curve", 26, -HARD, HILL_M],
    ["straight", 14],
    ["hill", 22, -HILL_L],
    ["scurve", 18, MED],
    ["curve", 40, HARD, HILL_S],
    ["straight", 16],
    ["hill", 28, HILL_M],
    ["curve", 30, -MED, -HILL_M],
    ["straight", 20],
  ];
}

function recipeMetropole() {
  return [
    ["straight", 16],
    ["curve", 18, HARD, 0],
    ["straight", 12],
    ["curve", 16, -HARD, 0],
    ["scurve", 14, MED],
    ["straight", 22],
    ["curve", 28, EASY, 0],
    ["straight", 10],
    ["curve", 20, -HARD, 0],
    ["curve", 20, HARD, 0],
    ["straight", 18],
    ["scurve", 16, EASY],
    ["straight", 24],
  ];
}

function recipeDunas() {
  return [
    ["straight", 44],
    ["hill", 26, HILL_S],
    ["curve", 34, EASY, HILL_S],
    ["straight", 30],
    ["hill", 36, -HILL_M],
    ["curve", 40, -MED, 0],
    ["straight", 24],
    ["scurve", 20, EASY],
    ["hill", 22, HILL_M],
    ["curve", 32, MED, -HILL_S],
    ["straight", 40],
  ];
}

function recipeVale() {
  return [
    ["straight", 22],
    ["scurve", 24, MED],
    ["hill", 20, HILL_S],
    ["curve", 30, -EASY, HILL_S],
    ["straight", 16],
    ["scurve", 20, EASY],
    ["curve", 36, HARD, -HILL_S],
    ["straight", 18],
    ["hill", 24, HILL_M],
    ["curve", 28, MED, 0],
    ["scurve", 18, MED],
    ["straight", 26],
  ];
}

export const TRACKS = [
  {
    id: "praia",
    name: "Praia Dourada",
    place: "Litoral",
    mood: "Sol alto, mar no horizonte, palmeiras na beira.",
    laps: 2,
    recipe: recipePraia,
    fog: 0.55,
    ambient: "#ffd7a0",
    sky: ["#5ec8ff", "#ffe7b8"],
    sun: { x: 0.78, y: 0.16, color: "#fff3c4", glow: "#ffbe5c" },
    grass: ["#d6c15a", "#c2a63c"],
    road: ["#5a5a5e", "#4c4c51"],
    rumble: ["#f2f2f2", "#d3542f"],
    lane: "#efefef",
    fogColor: "#cfe8ff",
    objects: ["palm", "bush", "sign"],
    night: false,
  },
  {
    id: "alpes",
    name: "Alpes de Prata",
    place: "Serra",
    mood: "Fim de tarde, pinheiros e ar frio.",
    laps: 2,
    recipe: recipeAlpes,
    fog: 0.7,
    ambient: "#c9d6e8",
    sky: ["#2a3d6b", "#f3a06a"],
    sun: { x: 0.18, y: 0.28, color: "#ffb36a", glow: "#ff7a3c" },
    grass: ["#2f4a38", "#243a2c"],
    road: ["#4a4e55", "#3c4046"],
    rumble: ["#e8e8e8", "#8b3a2a"],
    lane: "#d9d9d9",
    fogColor: "#6b7d99",
    objects: ["pine", "rock", "bush"],
    night: false,
  },
  {
    id: "metro",
    name: "Metrópole",
    place: "Cidade",
    mood: "Noite molhada, neon e prédios.",
    laps: 2,
    recipe: recipeMetropole,
    fog: 0.62,
    ambient: "#7aa7ff",
    sky: ["#070814", "#1a1640"],
    sun: { x: 0.72, y: 0.12, color: "#f4f1ff", glow: "#7c5cff" },
    grass: ["#151820", "#10131a"],
    road: ["#2b2d36", "#22242c"],
    rumble: ["#ff2d8a", "#2de2ff"],
    lane: "#8be9ff",
    fogColor: "#14122a",
    objects: ["building", "lamp", "sign"],
    night: true,
  },
  {
    id: "dunas",
    name: "Dunas do Norte",
    place: "Deserto",
    mood: "Calor, horizonte longo, chão de cobre.",
    laps: 2,
    recipe: recipeDunas,
    fog: 0.4,
    ambient: "#ffc27a",
    sky: ["#6ec6ff", "#ffe0a3"],
    sun: { x: 0.5, y: 0.1, color: "#fff7d6", glow: "#ff9a3c" },
    grass: ["#e0b36a", "#c99240"],
    road: ["#6a5b4a", "#5a4c3d"],
    rumble: ["#fff2cf", "#b8431f"],
    lane: "#f3e2b8",
    fogColor: "#f0d09a",
    objects: ["cactus", "rock", "bush"],
    night: false,
  },
  {
    id: "vale",
    name: "Vale Verde",
    place: "Floresta",
    mood: "Névoa baixa, sombra e cheiro de chuva.",
    laps: 2,
    recipe: recipeVale,
    fog: 0.82,
    ambient: "#9ad7a6",
    sky: ["#6d8ea3", "#c5d7c4"],
    sun: { x: 0.3, y: 0.2, color: "#eef6d8", glow: "#b7d47a" },
    grass: ["#1f5a32", "#164628"],
    road: ["#3f4340", "#323632"],
    rumble: ["#dfe7d4", "#2f6a38"],
    lane: "#d5e3cc",
    fogColor: "#8aa68c",
    objects: ["pine", "bush", "sign"],
    night: false,
  },
];

export function applyUpgrades(car, upgrades) {
  const e = upgrades.engine || 0;
  const t = upgrades.tires || 0;
  const n = upgrades.nitro || 0;
  return {
    ...car,
    top: car.top * (1 + e * 0.08),
    accel: car.accel * (1 + e * 0.1),
    grip: car.grip * (1 + t * 0.11),
    offroad: 1 + t * 0.18,
    nitro: car.nitro * (1 + n * 0.16),
    nitroTank: 1 + n * 0.22,
    fuel: car.fuel,
  };
}
