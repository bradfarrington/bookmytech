// Static UK-market vehicle catalogue for the "use car details" booking path.
//
// DVLA's Vehicle Enquiry Service is a per-registration LOOKUP, not a catalogue —
// it can't enumerate makes/models (and doesn't even return the model). So when a
// customer books without a plate, we drive the Make/Model dropdowns from this
// curated list instead. It deliberately favours breadth of *makes* and the
// common *models* per make over exhaustive trim-level accuracy: the booking flow
// only needs to identify the car well enough for the mechanic and the records —
// pricing is by service + postcode, not by exact variant. Anything not listed is
// still accepted as free text by the combobox, so coverage gaps never block a
// booking.

export const MODELS_BY_MAKE: Record<string, string[]> = {
  Abarth: ["595", "695", "124 Spider", "500e", "600e"],
  "Alfa Romeo": ["Giulia", "Giulietta", "Stelvio", "Tonale", "MiTo", "159", "Brera", "147", "156", "GT", "Junior"],
  Alpine: ["A110"],
  "Aston Martin": ["DB9", "DB11", "DB12", "DBS", "Vantage", "DBX", "Rapide", "Vanquish", "Virage"],
  Audi: ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "Q2", "Q3", "Q4 e-tron", "Q5", "Q7", "Q8", "TT", "R8", "e-tron", "e-tron GT", "RS3", "RS4", "RS5", "RS6", "RS7", "S3", "S4", "S5", "SQ5"],
  Bentley: ["Continental GT", "Flying Spur", "Bentayga", "Mulsanne", "Arnage"],
  BMW: ["1 Series", "2 Series", "3 Series", "4 Series", "5 Series", "6 Series", "7 Series", "8 Series", "X1", "X2", "X3", "X4", "X5", "X6", "X7", "Z4", "i3", "i4", "i5", "i7", "iX", "iX1", "iX3", "M2", "M3", "M4", "M5", "X5 M"],
  BYD: ["Atto 3", "Dolphin", "Seal", "Han", "Tang", "Seal U", "Sealion 7"],
  Cadillac: ["Escalade", "CTS", "XT4", "Lyriq"],
  Caterham: ["Seven 270", "Seven 360", "Seven 420", "Seven 620"],
  Chevrolet: ["Spark", "Aveo", "Cruze", "Captiva", "Orlando", "Camaro", "Corvette", "Matiz"],
  Chrysler: ["300C", "Ypsilon", "Grand Voyager", "PT Cruiser"],
  Citroen: ["C1", "C3", "C3 Aircross", "C4", "C4 Cactus", "C4 X", "C5", "C5 Aircross", "C5 X", "Berlingo", "DS3", "DS4", "DS5", "Nemo", "Dispatch", "Relay", "Ami", "e-C4"],
  Cupra: ["Leon", "Formentor", "Born", "Ateca", "Tavascan", "Terramar"],
  Dacia: ["Sandero", "Sandero Stepway", "Duster", "Jogger", "Logan", "Spring", "Bigster"],
  Daewoo: ["Matiz", "Lacetti", "Nubira", "Kalos", "Lanos"],
  Daihatsu: ["Sirion", "Terios", "Materia", "Charade", "Copen"],
  Dodge: ["Nitro", "Journey", "Caliber", "Ram", "Challenger"],
  DS: ["DS 3", "DS 4", "DS 7", "DS 9", "DS 3 Crossback"],
  Ferrari: ["Roma", "Portofino", "296 GTB", "SF90", "F8 Tributo", "812", "Purosangue", "488", "California", "458"],
  Fiat: ["500", "500e", "500X", "500L", "Panda", "Tipo", "Punto", "Doblo", "Ducato", "600", "Multipla", "Qubo"],
  Ford: ["Fiesta", "Focus", "Puma", "Kuga", "Mondeo", "EcoSport", "Ka", "Ka+", "C-Max", "S-Max", "Galaxy", "B-Max", "Mustang", "Mustang Mach-E", "Edge", "Ranger", "Transit", "Transit Custom", "Transit Connect", "Tourneo", "Explorer", "Capri"],
  Genesis: ["G70", "G80", "G90", "GV60", "GV70", "GV80"],
  Honda: ["Jazz", "Civic", "Civic Type R", "CR-V", "HR-V", "ZR-V", "e", "e:Ny1", "Accord", "Insight", "CR-Z", "FR-V", "Legend"],
  Hummer: ["H2", "H3"],
  Hyundai: ["i10", "i20", "i30", "i40", "Bayon", "Kona", "Tucson", "Santa Fe", "Ioniq", "Ioniq 5", "Ioniq 6", "Nexo", "ix20", "ix35", "ix20", "Inster"],
  Ineos: ["Grenadier"],
  Infiniti: ["Q30", "Q50", "Q60", "QX30", "QX70"],
  Isuzu: ["D-Max", "Trooper", "Rodeo"],
  Jaguar: ["XE", "XF", "XJ", "F-Type", "E-Pace", "F-Pace", "I-Pace", "X-Type", "S-Type", "XK"],
  Jeep: ["Renegade", "Compass", "Cherokee", "Grand Cherokee", "Wrangler", "Avenger", "Gladiator"],
  Kia: ["Picanto", "Rio", "Ceed", "ProCeed", "XCeed", "Stonic", "Soul", "Niro", "Sportage", "Sorento", "EV6", "EV9", "EV3", "Stinger", "Venga", "Carens"],
  Lamborghini: ["Huracan", "Aventador", "Urus", "Revuelto", "Gallardo"],
  Lancia: ["Ypsilon", "Delta", "Musa"],
  "Land Rover": ["Defender", "Discovery", "Discovery Sport", "Range Rover", "Range Rover Sport", "Range Rover Velar", "Range Rover Evoque", "Freelander"],
  LEVC: ["TX", "VN5"],
  Lexus: ["CT", "IS", "ES", "LS", "UX", "NX", "RX", "RZ", "RC", "LC", "LBX", "GS"],
  Lotus: ["Elise", "Exige", "Evora", "Emira", "Eletre", "Emeya"],
  Maserati: ["Ghibli", "Quattroporte", "Levante", "Grecale", "GranTurismo", "MC20"],
  Maxus: ["Deliver 9", "eDeliver 3", "eDeliver 9", "T90 EV", "Mifa 9", "Euniq"],
  Mazda: ["Mazda2", "Mazda3", "Mazda6", "CX-3", "CX-30", "CX-5", "CX-60", "CX-80", "MX-5", "MX-30", "RX-8"],
  McLaren: ["570S", "600LT", "650S", "720S", "750S", "Artura", "GT", "765LT"],
  "Mercedes-Benz": ["A-Class", "B-Class", "C-Class", "E-Class", "S-Class", "CLA", "CLS", "GLA", "GLB", "GLC", "GLE", "GLS", "G-Class", "SL", "SLK", "SLC", "AMG GT", "EQA", "EQB", "EQC", "EQE", "EQS", "EQV", "V-Class", "Vito", "Sprinter", "Citan"],
  MG: ["MG3", "MG4", "MG5", "ZS", "HS", "MG ZS EV", "Cyberster", "MG6", "TF", "ZT", "MGB", "Midget"],
  MINI: ["Hatch", "Cooper", "Clubman", "Countryman", "Convertible", "Paceman", "Roadster", "Aceman", "Electric"],
  Mitsubishi: ["Mirage", "Colt", "ASX", "Eclipse Cross", "Outlander", "Shogun", "Shogun Sport", "L200", "Lancer", "Space Star"],
  Morgan: ["Plus Four", "Plus Six", "4/4", "Roadster", "3 Wheeler", "Super 3"],
  Nissan: ["Micra", "Note", "Leaf", "Juke", "Qashqai", "X-Trail", "Ariya", "GT-R", "370Z", "Z", "Navara", "Pulsar", "350Z", "Primera", "Pathfinder", "Townstar", "Interstar"],
  Noble: ["M600"],
  Peugeot: ["108", "208", "2008", "308", "3008", "408", "508", "5008", "e-208", "e-2008", "Rifter", "Partner", "Expert", "Boxer", "Traveller", "RCZ", "107", "207", "307", "407"],
  Polestar: ["Polestar 2", "Polestar 3", "Polestar 4"],
  Porsche: ["911", "718 Cayman", "718 Boxster", "Panamera", "Macan", "Cayenne", "Taycan", "Cayman", "Boxster"],
  Proton: ["Savvy", "Gen-2", "Satria"],
  Renault: ["Clio", "Captur", "Megane", "Megane E-Tech", "Scenic", "Kadjar", "Austral", "Arkana", "Zoe", "Twingo", "Kangoo", "Trafic", "Master", "Espace", "Koleos", "Twizy", "5 E-Tech", "Rafale"],
  "Rolls-Royce": ["Phantom", "Ghost", "Wraith", "Dawn", "Cullinan", "Spectre"],
  Rover: ["25", "45", "75", "200", "400", "600", "Metro", "Streetwise"],
  Saab: ["9-3", "9-5", "9000", "900", "9-4X"],
  SEAT: ["Ibiza", "Leon", "Arona", "Ateca", "Tarraco", "Alhambra", "Mii", "Toledo", "Exeo"],
  Skoda: ["Citigo", "Fabia", "Scala", "Octavia", "Superb", "Rapid", "Kamiq", "Karoq", "Kodiaq", "Enyaq", "Elroq", "Yeti", "Roomster"],
  Smart: ["ForTwo", "ForFour", "#1", "#3", "Roadster"],
  SsangYong: ["Tivoli", "Korando", "Rexton", "Musso", "Turismo"],
  Subaru: ["Impreza", "Legacy", "Forester", "Outback", "XV", "Crosstrek", "BRZ", "Levorg", "WRX", "Solterra"],
  Suzuki: ["Alto", "Celerio", "Swift", "Baleno", "Ignis", "Vitara", "S-Cross", "Jimny", "SX4", "Splash", "Across", "Swace"],
  Tesla: ["Model 3", "Model S", "Model X", "Model Y", "Roadster", "Cybertruck"],
  Toyota: ["Aygo", "Aygo X", "Yaris", "Yaris Cross", "Corolla", "Camry", "C-HR", "RAV4", "Highlander", "Prius", "GR Yaris", "GR86", "Supra", "bZ4X", "Land Cruiser", "Hilux", "Proace", "Avensis", "Auris", "Verso", "iQ", "Mirai"],
  Triumph: ["Spitfire", "TR6", "Stag", "Herald", "Dolomite"],
  TVR: ["Chimaera", "Cerbera", "Sagaris", "Tuscan", "Griffith"],
  Vauxhall: ["Corsa", "Astra", "Insignia", "Mokka", "Crossland", "Grandland", "Adam", "Viva", "Combo", "Vivaro", "Movano", "Zafira", "Meriva", "Antara", "Cascada", "GTC", "Agila", "Vectra", "VXR8", "Frontera"],
  Volkswagen: ["up!", "Polo", "Golf", "Golf GTI", "Golf R", "Passat", "Arteon", "T-Cross", "T-Roc", "Taigo", "Tiguan", "Touareg", "Touran", "Sharan", "ID.3", "ID.4", "ID.5", "ID.7", "ID.Buzz", "Beetle", "Scirocco", "Caddy", "Transporter", "Crafter", "Amarok", "Jetta", "Tayron"],
  Volvo: ["V40", "V60", "V90", "S60", "S90", "XC40", "XC60", "XC90", "C40", "EX30", "EX40", "EX90", "C30", "V50"],
};

// Make list derived from the catalogue keys, alphabetised. Single source of
// truth — add a make once (with its models) and it appears in the dropdown.
export const VEHICLE_MAKES: string[] = Object.keys(MODELS_BY_MAKE).sort((a, b) =>
  a.localeCompare(b),
);

/** Models for a make, matched case-insensitively. Empty array if unknown. */
export function modelsForMake(make: string): string[] {
  if (!make) return [];
  const key = Object.keys(MODELS_BY_MAKE).find(
    (m) => m.toLowerCase() === make.trim().toLowerCase(),
  );
  return key ? MODELS_BY_MAKE[key] : [];
}

/** Years from the current year back to `earliest` (default 1990), newest first. */
export function yearOptions(earliest = 1990): number[] {
  const current = new Date().getFullYear() + 1; // include next plate year
  const years: number[] = [];
  for (let y = current; y >= earliest; y--) years.push(y);
  return years;
}
