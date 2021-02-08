# elm-publish-action

Publishes your elm package if you're on the main or master branch and
the elm.json version is unpublished. It will automatically
create a tag in github and run publish.

## Project Goals

- Publish a new Elm package version simply by running `elm bump` and committing your `elm.json` with the new version. From there, this tool will perform the rest of the publish steps.
- Publish a new version *only if* your CI fails - the last thing you want is to publish and then realize your test suite was failing. But your build failure came back after you ran `elm publish` by hand. This tool fixes that problem by running `elm publish` for you (and creating the appropriate git tags) *within your build process*, so you can make sure the rest of your build succeeds before publishing.

The ideal that this tool strives for is:

- Any time `elm publish` would fail, this package will let you know *before* you try to publish to give you early feedback. You don't want to wait to find out that your documentation isn't ready to publish until you decide to publish. You want to get that feedback early and often, well before you try to publish.

This action is idempotent, so you can run this as much as you want and it will always do the right thing:
* No-op and succeed if the current version in elm.json exists in the registry (it actually fetches the published examples to check from the source of truth)
* Try to publish otherwise
* If it's publishable, tag and publish
* If it's not publishable, don't tag, just show failure message in CI output


## Initial publish must be done manually

This action will entirely skip publishing if you haven't yet published a release.

So you'll need to do the first release manually. Otherwise there would be a risk of accidentally
pushing version 1.0.0 before you're ready to publish.

## Suggested workflow

This action only publishes on the main or master branch. So a good workflow is to change versions on a branch, and
then once you merge that branch the new release will happen as soon as your CI finishes. Or if your CI fails,
you'll get a chance to fix it before the release goes out.

![Screenshot 1](https://raw.githubusercontent.com/dillonkearns/elm-publish-action/master/screenshots/1.png)

![Screenshot 2](https://raw.githubusercontent.com/dillonkearns/elm-publish-action/master/screenshots/2.png)

## Path to elm compiler

You can pass in an input like this:

```yml
- uses: dillonkearns/elm-publish-action@v1
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
      - main
  pull_request:
    branches:
      - main

jobs:
  # define other jobs here, like test, etc.


  publish-elm-package:
    needs: [test, lint, validate-package] # make sure all your other jobs succeed before trying to publish
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v2
      - name: Use Node.js
        uses: actions/setup-node@v1
        with:
          node-version: 15
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
      - uses: dillonkearns/elm-publish-action@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          path-to-elm: ./node_modules/.bin/elm
```

## Checking if a package is ready to publish

You can run this action in `dry-run` mode and use the `is-publishable` output to see if it will try to perform a publish. One way you can use this is to perform a pre-publish action.

```yml
      - uses: dillonkearns/elm-publish-action@v1
        id: publish
        with:
          dry-run: true
          path-to-elm: ./node_modules/.bin/elm
      - if: steps.publish.outputs.is-publishable == 'true'
         run: echo "elm-publish-action is going to publish if run without dry-run=true"
```

Note that there is no `github-token` key. This action will fail if you provide a `github-token` in `dry-run` mode. It requires you to omit the token for a dry-run to ensure that it *can't* publish.
