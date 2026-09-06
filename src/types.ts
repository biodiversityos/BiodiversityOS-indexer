export enum Species {
  NURSE_SHARK                = "nurse_shark",
  CARIBBEAN_REEF_SHARK       = "caribbean_reef_shark",
  GREAT_HAMMERHEAD_SHARK     = "great_hammerhead_shark",
  HAMMERHEAD_SHARK           = "hammerhead_shark",
  SCALLOPED_HAMMERHEAD_SHARK = "scalloped_hammerhead_shark",
  BULL_SHARK                 = "bull_shark",
  TIGER_SHARK                = "tiger_shark",
  WHALE_SHARK                = "whale_shark",
  SANDBAR_SHARK              = "sandbar_shark",
  UNKNOWN                    = "unknown",
}

export enum Behavior {
  FEEDING   = "feeding",
  MIGRATING = "migrating",
  RESTING   = "resting",
  MATING    = "mating",
  HUNTING   = "hunting",
  STRANDED  = "stranded",
  UNKNOWN   = "unknown",
}

export const SPECIES_VALUES  = new Set(Object.values(Species));
export const BEHAVIOR_VALUES = new Set(Object.values(Behavior));

export function parseSpecies(v: string): Species {
  return SPECIES_VALUES.has(v as Species) ? (v as Species) : Species.UNKNOWN;
}

export function parseBehavior(v: string): Behavior {
  return BEHAVIOR_VALUES.has(v as Behavior) ? (v as Behavior) : Behavior.UNKNOWN;
}
