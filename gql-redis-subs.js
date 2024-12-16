const { RedisPubSub } = require('graphql-redis-subscriptions')
const express = require('express')
const { ApolloServer } = require('apollo-server-express')
const { createServer } = require('http')
const moment = require('moment')

moment.locale('id')
const CHANNEL = 'simpus'
const messages = [];

const Config = {
  serverPort: process.env.SERVER_PORT || 8081,
}

const pubsub = new RedisPubSub({
  connection: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    retry_strategy: options => Math.max(options.attempt * 100, 3000)
  }
});

pubsub.subscribe(CHANNEL, (payload) => {
  try {
    if(payload.simpus.row) {
      let row = payload.simpus.row
      console.log(row)
    }
    messages.push(payload); 
  } catch (error) {
    console.error(`Error trying to extract new message = require(payload`);
    console.error(error.message);
  }
})

const resolvers = {
  Query: {
    messages(root, {}, context) {
      return messages;
    }
  },
  Subscription: {
    simpus: {
      subscribe: () => pubsub.asyncIterator(CHANNEL),
    },
  },
};

const typeDefs = `
type Tanggal {
  hari: String
  tanggal: Int
  bulan: String
  tahun: Int
}

type Metadata {
  message: String
  code: Int
}

type Provider {
  kdProvider: String
  nmProvider: String
}

type Kelas {
  nama: String
  kode: String
}

type Asuransi {
  kdAsuransi: String
  nmAsuransi: String
  noAsuransi: String
  cob: Boolean
}

type Row {
  id: ID
  user_id: ID
  url: String
  method: String
  timestamp: String
  metadata: Metadata
  count: Int
  no_bpjs: String
  checked: String
  noKartu: String
  nama: String
  hubunganKeluarga: String
  sex: String
  tglLahir: String
  tglMulaiAktif: String
  tglAkhirBerlaku: String
  kdProviderPst: Provider
  kdProviderGigi: Provider
  jnsKelas: Kelas
  jnsPeserta: Kelas
  golDarah: String
  noHP: String
  noKTP: String
  pstProl: String
  pstPrb: String
  aktif: Boolean
  ketAktif: String
  asuransi: Asuransi
  tunggakan: Int
}

type Message {
  type: String!
  table: String!
  timestamp: Float
  tanggal: Tanggal
  row: Row
}

type Query {
  messages: [Message!]!
}

type Subscription {
  simpus: Message
}
`;

const app = express()

const apolloServer = new ApolloServer({ typeDefs, resolvers })

apolloServer.applyMiddleware({ app })

const server = createServer(app);

apolloServer.installSubscriptionHandlers(server)

server.listen({ port: Config.serverPort }, () => {
  console.log(`🚀 Server ready at http://localhost:${Config.serverPort}${apolloServer.graphqlPath}`);
  console.log(`🚀 Subscriptions ready at ws://localhost:${Config.serverPort}${apolloServer.subscriptionsPath}`);
});
