const SIGHTING_COMPONENTS = [
  { name: "latitude",   type: "int256"  },
  { name: "longitude",  type: "int256"  },
  { name: "species",    type: "string"  },
  { name: "count",      type: "uint16"  },
  { name: "behavior",   type: "string"  },
  { name: "observedAt", type: "uint256" },
  { name: "mediaUrl",   type: "string"  },
  { name: "comment",    type: "string"  },
  { name: "siteName",   type: "string"  },
  { name: "depthFt",    type: "uint16"  },
  { name: "sizeClass",  type: "string"  },
] as const;

export const REGISTRY_ABI = [
  {
    type: "event",
    name: "RecordCreated",
    inputs: [
      { name: "recordId", type: "uint256", indexed: true },
      { name: "reporter", type: "address", indexed: true },
      { name: "sighting", type: "tuple", indexed: false, components: SIGHTING_COMPONENTS },
    ],
  },
  {
    type: "event",
    name: "RecordUpdated",
    inputs: [
      { name: "recordId", type: "uint256", indexed: true },
      { name: "reporter", type: "address", indexed: true },
      { name: "sighting", type: "tuple", indexed: false, components: SIGHTING_COMPONENTS },
    ],
  },
  {
    type: "event",
    name: "RecordVoided",
    inputs: [
      { name: "recordId", type: "uint256", indexed: true },
      { name: "voidedBy", type: "address", indexed: true },
    ],
  },
] as const;
