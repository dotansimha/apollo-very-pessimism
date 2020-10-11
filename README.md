This repository reproduced a memory leak introduced in Apollo-Client v3.

This leak occurs when you use `watchQuery` along with `context` passes. Due to the fact the AC3 keeps an internal pointer to that `context` object, and something internally with Apollo cleanup mechanism isn't functioning, it causes this object to retain in memory, even after cleaning

Actual issue: https://github.com/apollographql/apollo-client/issues/7149

Related Issues:

- https://github.com/apollographql/apollo-client/issues/7086
- https://github.com/apollographql/apollo-client/issues/6985
- https://github.com/apollographql/apollo-client/issues/7013

## How to run this test:

1. Run `yarn` to install deps.
2. Run `yarn test` to run Jest and the test - if you are getting a timeout after 20s, it means that Apollo-Client still holds a reference to our object.
3. You can run `yarn test:debug` and and then attach Chrome DevTools - you should be able to use that to take Heap snapshots (no need for breakpoints, I added `debugger` statements on the important places, and it tells you when to take the snapshot).
4. If you'll comment out the L51 (`context: myContext,`) - test will pass.
