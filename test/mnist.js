#!/usr/bin/env node
/*-------------------------------------------------------------------
 *  This is a test script.  Its import paths are relative to this
 *  test directory but, otherwise, paths are relative to main npm
 *  package folder, one level up (or perhaps wherever you run
 *  'npm test' from).
 *
 *  @example
 *    npm test -- --database=testing 2>&1 | tee log
 *    # or equivalently
 *    npm test -- -d testing 2>&1 | tee log
 *    # or to force usage summary
 *    npm test -- --foo 2>&1 | tee log
 */
'use strict'

const fs = require('fs')
const Database = require('../lib/Database')

// Process any command line. Remember, for npm, the rubadub
// is "npm test -- --arg1=foo --arg2=bar etc."

const cli = processCommandLine(process.argv.slice(2))

// Load database and bookmark indices for user feedback.

const database = new Database()
const indices = database.getIndices() // [imageIndex, labelIndex]
let totalLengths = [0, 0]

// Get database collator/reader and do your main thing.

const collator = database.getReader(cli.database, cli.begin, cli.count)
main(collator)

//-------------------------------------------------------------------

async function main(reader) {
  try {
    for await (const data of reader) {
      const lengths = [], formatted = []
      for (let i = 0; i < data.length; ++i) {
        lengths.push(data[i] ? data[i].length : 0)
        formatted.push(formatBuffer(data[i], lengths[i]))
        totalLengths[i] += lengths[i]
      }
      let message = formatted.reduce((accumulator, current) => {
        return accumulator + ', ' + current
      })
      console.log(`Received ${message}`)
    }
  }
  catch (reject) {
    throw reject  // See old notes at bottom of file.
  }
  finally {
    let i = 0, comma = '', pretty = ''
    for (; i < totalLengths.length; ++i, comma = ', ') {
      const length = totalLengths[i]
      const size = indices[i].size
      pretty += comma + length / size + ' x ' + size
    }
    console.log(`Total bytes received = [${pretty}]`)
  }
}

//-------------------------------------------------------------------

function formatBuffer(buffy, buffyLength, windowLength = 5) {
  if (buffyLength === 0) {
    switch (typeof buffy) {
      case 'null':
        return 'null'
      case 'undefined':
        return 'undefined'
    }
    return ''
  }
  let amid = Math.max(0, Math.floor((buffyLength - windowLength) / 2))
  let peek = buffy.slice(amid, amid + windowLength)
  peek = Array.from(peek).toString()
  if (buffyLength > windowLength)
    peek = '...,' + peek + ',...'
  return '[' + peek + ']'
}

//-------------------------------------------------------------------

function processCommandLine(args) {

  const defaults = {
    database: 'training',
    begin: 0,
    count: null,  // Defaults to entire database.
  }
  const options = defaults  // Returned to caller.

  const lookup = {} // Match least ambiguous name.
  for (const key of ['begin', 'count', 'database'])
    for (let i = 0; i < key.length; ++i)
      lookup[key.substr(0, 1 + i)] = key

  for (let i = 0; i < args.length; ++i) {
    let name = null, value = null
    const match = /^--?(\w+)((\s*=\s*)(\w+)$)?/.exec(args[i])
    if (match) {
      name = lookup[match[1].toLowerCase()]
      if (match[4]) value = match[4]
    }
    if (!name)
      usage(`Syntax error near "${args[i]}"`)
    if (!value) {
      value = args[++i]
      if (value === null || typeof value === 'undefined')
        usage(`Value not found for parameter "${name}"`)
    }
    options[name] = value
  }

  // Let Database and Index validate input, no need for extra wheels.

  return options
}

//-------------------------------------------------------------------

function usage(message) {
  if (message)
    console.error(message)
  console.error()
  const fileName = __filename.replace(/.*[\\\/]/, '')
  console.error(`usage: ${fileName}`
    + ` [--b|egin=<beginIndex>]`
    + ` [--c|ount=<elementCount>]`
    + ` [--d|atabase=<'training'|'testing'>]\n`
  )
  process.exit(1)
}

// This is the first message logged.  :)
console.log('LEAVING MAIN SCRIPT')

// OLD NOTES - delete once you've forgotten what they mean.

/*
 *  Node emits these crash warnings about how bad programmers are
 *  for not catching rejected promises.  If you plan to rethrow, I
 *  think it needs to happen Outside uppermost async in order to
 *  cancel the warning.
 *
 *  Sorry, Charlie, this makes no difference.  Node evidently does
 *  not want to catch Any rejected promise, even if you are doing so
 *  outside of any asynchronous context.  Hmm...
 *
 *  Yikes!  Node emits fearmongering even if we just print a message
 *  in our catch that is outside any async stuff.  What is Ms. Node
 *  thinking?  Here is the message:
 *
 *  (node:82425) UnhandledPromiseRejectionWarning: Error: Forced
 *    error inside promise
 *    at main (/Users/Name/Developer/MLP/app.js:100:9)
 *    at processTicksAndRejections (internal/process/task_queues.js:89:5)
 *  (node:82425) UnhandledPromiseRejectionWarning: Unhandled promise
 *    rejection. This error originated either by throwing inside of
 *    an async function without a catch block, or by rejecting a
 *    promise which was not handled with .catch(). (rejection id: 1)
 *  (node:82425) [DEP0018] DeprecationWarning: Unhandled promise
 *    rejections are deprecated. In the future, promise rejections
 *    that are not handled will terminate the Node.js process with
 *    a non-zero exit code.
 *
 *  Methinks node emits this way too low.  It should let exceptions
 *  trickle up and out to the first handler.  THEN if it has not
 *  been caught, print scary messages.  OTHERWISE, programmers would
 *  need to litter (litter?) code with try blocks for every possible
 *  combination of promissory code and promises can go deeper than
 *  stack frames.  Maybe.
 *
 *  Correction.  My catcher is reached when attached directly to the
 *  'for await...of' above.  You still get scary message if error is
 *  rethrown here but at least this is where you could recover.  And
 *  it still seems unusual: exceptions have trickled up the stack
 *  since the Red Sea was allegedly parted.
 */
