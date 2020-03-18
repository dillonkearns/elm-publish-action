# elm-publish-action

Publishes your elm package if you're on the master branch and
the elm.json version is unpublished. It will automatically
create a tag in github and run publish.

This action is idempotent, so you can run this as much as you want and it will always do the right thing:
* No-op and succeed if the current version in elm.json exists in the registry (it actually fetches the published examples to check from the source of truth)
* Try to publish otherwise
* If it's publishable, tag and publish
* If it's not publishable, don't tag, just show failure message in CI output

This is nice because you can make sure your CI is passing before
the finalizing the git tag and Elm package release.

## Initial publish must be done manually

This action will entirely skip publishing if you haven't yet published a release.

So you'll need to do the first release manually. Otherwise there would be a risk of accidentally
pushing version 1.0.0 before you're ready to publish.

## Suggested workflow

This action only publishes on the master branch. So a good workflow is to change versions on a branch, and
then once you merge that branch the new release will happen as soon as your CI finishes. Or if your CI fails,
you'll get a chance to fix it before the release goes out.

![Screenshot 1](https://raw.githubusercontent.com/dillonkearns/elm-publish-action/master/screenshots/1.png)

![Screenshot 2](https://raw.githubusercontent.com/dillonkearns/elm-publish-action/master/screenshots/2.png)

## Path to elm compiler

You can pass in an input like this:

```
- uses: dillonkearns/elm-publish-action@master
with:
  github-token: ${{ secrets.GITHUB_TOKEN }}
  path-to-elm: ./node_modules/.bin/elm
```

And it will use the supplied path. Otherwise, it will use whatever elm binary it finds on the PATH.

## Example Workflow Setup


```yml
name: Elm Actions

on:
  push:
    branches:
      - master
  pull_request:
    branches:
      - master

jobs:
  # define other jobs here, like test, etc.


  publish-elm-package:
    needs: [test, lint, validate-package] # make sure all your other jobs succeed before trying to publish
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v2
      - name: Use Node.js 13
        uses: actions/setup-node@v1
        with:
          node-version: 13
      - uses: actions/cache@v1
        with:
          path: ~/.npm
          key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}
          restore-keys: |
            ${{ runner.os }}-node-
      - uses: actions/cache@v1
        id: elm-cache
        with:
          path: ~/.elm
          key: ${{ runner.os }}-elm--home-${{ hashFiles('**/elm.json') }}
      - run: npm ci
      - run: npx --no-install elm make --output /dev/null && cd examples && npx --no-install elm make src/*.elm --output /dev/null && cd ..
      - uses: dillonkearns/elm-publish-action@master
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          path-to-elm: ./node_modules/.bin/elm
```
