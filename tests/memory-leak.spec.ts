import {
  ApolloClient,
  InMemoryCache,
  ObservableQuery,
  ApolloLink,
} from "@apollo/client/core";
import { SchemaLink } from "@apollo/client/link/schema";
import { parse } from "graphql";
import weak from "weak-napi";
import path from "path";
import heapdump from "heapdump";
import { makeExecutableSchema } from "@graphql-tools/schema";

function makeHeapSnapshot(label: string) {
  const file = path.resolve(
    __dirname,
    "../heapsnapshots",
    label + ".heapsnapshot"
  );
  heapdump.writeSnapshot(file, (error) => {
    if (error) {
      console.error(`Failed to snapshot: ${label}`);
      console.error(error);
    }
  });
}

describe("Memory leaks", () => {
  let client: ApolloClient<any> | null = null;
  let cache: InMemoryCache | null = null;
  let link: ApolloLink | null = null;

  beforeEach(() => {
    cache = new InMemoryCache();
    link = new SchemaLink({
      schema: makeExecutableSchema({
        typeDefs: /* GraphQL */ `
          type Query {
            foo: String
            user: User
          }

          type Mutation {
            updateUser: User!
          }

          type User {
            id: ID!
            name: String
          }
        `,
        resolvers: {
          Query: {
            user: () => ({ id: 1, name: "Dotan" }),
          },
          Mutation: {
            updateUser: async () => {
              throw Error("asdasd");
            },
          },
        },
      }),
    });
  });

  afterEach(() => {
    process.env.NODE_ENV = 'test';
    client = null;
    cache = null;
    link = null;
  });

  class MyContextObject {
    public dummyData = `======================================================================================`;
  }

  function runTest(done: jest.DoneCallback, prefix: string) {
    let myContext: MyContextObject | undefined = new MyContextObject();

    weak(myContext, function () {
      console.log(`YES! "myContext" is no longer in memory!`);
      done();
    });

    // Create teh GraphQL query object, and watch it.
    // Here, we pass `context` as our custom object.
    // Later - you'll see that Apollo retains it in memory.
    let query$: ObservableQuery | undefined = client?.watchQuery({
      query: parse(`query user { user { id name } }`),
      context: myContext,
    });
    // Now, subscribe to it, and wait for some data to arrive
    let subscription:
      | ZenObservable.Subscription
      | undefined = query$?.subscribe(() => {});

    setTimeout(() => {
      client
        ?.mutate({
          context: myContext,
          mutation: parse(`mutation updateUser { updateUser { id name }}`),
        })
        .catch(() => {
          if (subscription) {
            subscription.unsubscribe();
          }
          subscription = undefined;
          query$ = undefined;
          myContext = undefined;
          global.gc();
          makeHeapSnapshot(prefix + "unsubscribed");

          setTimeout(() => {
            makeHeapSnapshot(prefix + "after-3-seconds");
          }, 3 * 1000);
        });
    }, 2 * 1000);
  }

  it(
    "should not keep trances of context after using watchQuery + mutation (defaults)",
    (done) => {
      client = new ApolloClient<any>({
        cache: cache!,
        link: link!,
      });

      runTest(done, 'devtools-');
    },
    30 * 1000
  );

  it(
    "should not keep trances of context after using watchQuery + mutation (devtools disabled)",
    (done) => {
      client = new ApolloClient<any>({
        cache: cache!,
        link: link!,
        connectToDevTools: false,
      });

      runTest(done, 'no-devtools-');
    },
    30 * 1000
  );

  it(
    "should not keep trances of context after using watchQuery + mutation (devtools disabled with NODE_ENV)",
    (done) => {
      process.env.NODE_ENV = 'production';
      client = new ApolloClient<any>({
        cache: cache!,
        link: link!,
      });

      runTest(done, 'node-env-');
    },
    30 * 1000
  );
});
