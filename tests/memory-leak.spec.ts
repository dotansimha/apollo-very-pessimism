import { ApolloClient, InMemoryCache, ObservableQuery } from "@apollo/client";
import { SchemaLink } from "@apollo/client/link/schema";
import { buildSchema, parse } from "graphql";
import weak from "weak-napi";

function makeStartStop() {
  let startedAt: number;

  return {
    start() {
      startedAt = Date.now();
    },
    stop(label: string) {
      const stoppedAt = Date.now();

      console.log(`${label} took`, stoppedAt - startedAt)
    }
  }
}

describe("Memory leaks", () => {
  let client: ApolloClient<any> | null = null;
  let time: ReturnType<typeof makeStartStop>;

  beforeEach(() => {
    const cache = new InMemoryCache();
    const link = new SchemaLink({
      schema: buildSchema(`type Query { foo: String }`),
    });
    client = new ApolloClient<any>({
      cache,
      link: link as any,
    });
    time = makeStartStop()
  });

  afterEach(() => {
    client = null;
  });

  class MyContextObject {
    public dummyData = `======================================================================================`;
  }

  it(
    "should not keep traces of context after running watchQuery",
    (done) => {
      // First, make we have a named object, which we can later refer to and find easily in snapshots
      // (that's why it's a class...)
      let myContext: MyContextObject | undefined = new MyContextObject();
      // If you are using `yarn test:debug`, that's a great time to go to Memory tab in
      // DevTools, and keep a memory snapshot, you should see there that you have an object named "MyContextObject"
      debugger;

      // Now, we create a weak reference for that object. The reason we do that is to make sure it's being collected
      // and removed from memory. The `done` callback is called when the object is being removed.
      // So if this test fails => object is still in memory!
      weak(myContext, function () {
        console.log(`YES! "myContext" is no longer in memory!`);

        time.stop(`GC`)
        done();
      })

      setTimeout(() => {
        debugger;
      }, 7 * 1000)

      // Create teh GraphQL query object, and watch it.
      // Here, we pass `context` as our custom object. Later - you'll see that Apollo retains it in memory.
      let query$: ObservableQuery | undefined = client?.watchQuery({
        query: parse(`query test { foo }`),
        context: myContext,
      });
      // Now, subscribe to it, and wait for some data to arrive
      let subscription:
        | ZenObservable.Subscription
        | undefined = query$?.subscribe((r) => {
        // Just to make sure it's done, and ready to use, if it's still "loading", we don't care
        if (r && r.data) {
          if (subscription) {
            // Subscription is done, we got the data, now let's unsubscribe from it
            subscription.unsubscribe();
          }
          // Cleanup! Clear all all Apollo related variables,
          subscription = undefined;
          query$ = undefined;
          // And of course, we are done with our context object, we can set it to `undefined`
          myContext = undefined;
          // Force garbage collector to clean everything. This should make sure we don't need to wait for idle state
          // in order to clean the memory.
          global.gc();
          // If you are debugging, and using `yarn test:debug`:
          // MAKE A HEAP SNAPSHOT NOW!
          // You should see that Apollo still holds a reference to our object, so this test will
          // never resolve, and fails on timeout.
          time.start()
          debugger;
        }
      });
    },
    30 * 1000
  );
});
