#!/usr/bin/env node
/**
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
const IDX = require('../lib/idx')

const { collate, bySize } = require('../lib/streamutils')

const debug = 0x01  // Use hex bits like 0x01.

// Process any command . Remember, for npm, the rubadub
// is "npm test -- --arg1=foo --arg2=bar etc."

const options = {
  begin: 0,
  count: null,
  database: 'training',
}

const lookup = {} // Match least ambiguous name.
for (const key of ['begin', 'count', 'database'])
  for (let i = 0; i < key.length; ++i)
    lookup[key.substr(0, 1 + i)] = key

for (let i = 2; i < process.argv.length; ++i) {
  const arg = process.argv[i]
  let name = null, value = null
  const match = /^--?(\w+)((\s*=\s*)(\w+)$)?/.exec(arg)
  if (match) {
    name = lookup[match[1].toLowerCase()]
    if (match[4]) value = match[4]
  }
  if (!name)
    usage(`Syntax error near "${arg}"`)
  if (!value) {
    value = process.argv[++i]
    if (value === null || typeof value === 'undefined')
      usage(`Value not found for parameter "${name}"`)
  }
  options[name] = value
}

// Validate input a little bit.

if (options.begin < 0)
  usage(`Value of "begin" must be a positive integer`)
if (options.database !== 'training' && options.database !== 'testing')
  usage(`Value of "--database" must be "training" or "testing"`)

// Print usage summary if input looks fishy (see above)

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

// Define and initialize data streams.

const inputs = {

  'training': {
    'images': {
      fileName: 'MNIST/train-images-idx3-ubyte',
      idx: null,
    },
    'labels': {
      fileName: 'MNIST/train-labels-idx1-ubyte',
      idx: null,
    },
  },

  'testing': {
    'images': {
      fileName: 'MNIST/t10k-images-idx3-ubyte',
      idx: null,
    },
    'labels': {
      fileName: 'MNIST/t10k-labels-idx1-ubyte',
      idx: null,
    },
  },
}

function loadIndex(forThis) {
  return forThis.idx = new IDX(forThis.fileName, options.begin, options.count)
}
const imgX = loadIndex(inputs[options.database].images)
const lblX = loadIndex(inputs[options.database].labels)
// const imgX = loadIndex(inputs.testing.images)
// const lblX = loadIndex(inputs.testing.labels)
const indices = [imgX, lblX]
let totalLengths = new Array(indices.length).fill(0)
const streams = [ // Really iterators over streams.
  bySize(imgX.reader, imgX.size),
  bySize(lblX.reader, lblX.size)
]
const reader = collate(streams) // A multiplexer.

main(reader)

async function main(reader) {
  try {
    for await (const data of reader) {
      if (debug & 0x01) { // Count the beans?
        const lengths = [], formatted = []
        for (let i = 0; i < data.length; ++i) {
          lengths.push(data[i] ? data[i].length : 0)
          formatted.push(formatBuffer(data[i], lengths[i]))
          totalLengths[i] += lengths[i]
        }
        /*
         *  Read console documentation before you die. console.debug?
         *  Try here for starters,
         *
         *    https://developer.mozilla.org/en-US/docs/Web/API/Console/log
         */
        let message = formatted.reduce((accumulator, current) => {
          return accumulator + ', ' + current
        })
        console.log(`Received ${message}`)
      }
    }
    // throw Error('Force error inside promise to watch fireworks')
  }
  catch (reject) {
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
    // console.error('Hello World')
    throw reject
  }
  finally {
    if (debug & 0x01) {
      let i = 0, comma = '', pretty = ''
      for (; i < totalLengths.length; ++i, comma = ', ') {
        const length = totalLengths[i]
        const size = indices[i].size
        pretty += comma + length / size + ' x ' + size
      }
      console.log(`Total bytes received = [${pretty}]`)
    }
  }
}

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

// This is the first message logged.  :)
console.log('LEAVING MAIN SCRIPT')
