export const typeDefs = /* GraphQL */ `
  enum Species {
    nurse_shark
    caribbean_reef_shark
    great_hammerhead_shark
    hammerhead_shark
    scalloped_hammerhead_shark
    bull_shark
    tiger_shark
    whale_shark
    sandbar_shark
    unknown
  }

  enum Behavior {
    feeding
    migrating
    resting
    mating
    hunting
    stranded
    unknown
  }

  type Record {
    id: Int!
    latitude: Float!
    longitude: Float!
    species: Species!
    count: Int!
    behavior: Behavior!
    "Null when the observation date was never recorded."
    observedAt: String
    mediaUrl: String
    comment: String
    siteName: String
    depthFt: Int
    sizeClass: String
    reporter: String!
    blockNumber: String!
    txHash: String!
    createdAt: String!
    updatedAt: String!
  }

  type RecordsPage {
    items: [Record!]!
    total: Int!
    hasMore: Boolean!
  }

  type SpeciesCount {
    species: Species!
    count: Int!
  }

  input RecordsFilter {
    species: Species
    behavior: Behavior
    reporter: String
    siteName: String
    observedAtGt: String
    observedAtGte: String
    observedAtLt: String
    observedAtLte: String
  }

  type Query {
    "limit is capped at 1000 by the server."
    records(limit: Int = 50, offset: Int = 0, filter: RecordsFilter): RecordsPage!
    record(id: Int!): Record
    "Distinct official dive-site names present in the index."
    sites: [String!]!
    "Sighting totals per species, honouring the same filter as records."
    speciesCounts(filter: RecordsFilter): [SpeciesCount!]!
  }
`;
