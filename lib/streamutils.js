// console.log(`\nmodule = %o`, module)
// console.log(`module.exports = %o`, module.exports)
// console.log(`exports = %o`, exports)
// console.log(`module.exports === exports = ${module.exports === exports}`)

/**
 *  Stream utilities.
 */

'use strict'
const assert = require('assert')
const stream = require('stream')

async function* byId(reader) {
  for await (const data of reader) {
    console.log(`byId: data = "${data}"`)
    yield data
  }
}

/**
 *
 * @param {stream.Readable} reader
 * @param {*} chunkSize
 */
async function* bySize(reader, chunkSize) {
  let prefix = null   // Save partial chunks between reads.
  let prefixLength = 0  // Allegedly expensive, track manually.
  for await (const data of reader) {
    const dataLength = data.length  // Expensive, do once.
    let dataOffset = 0
    if (prefix) {
      const needed = chunkSize - prefixLength
      if (dataLength < needed) {
        let totalLength = prefixLength + dataLength
        prefix = Buffer.concat([prefix, data], totalLength)
        prefixLength = totalLength, dataOffset = dataLength
      } else {
        const suffix = data.slice(0, needed)
        dataOffset += needed
        yield Buffer.concat([prefix, suffix], chunkSize)
        prefix = null, prefixLength = 0
      }
    }
    while (dataLength - dataOffset >= chunkSize) {
      yield data.slice(dataOffset, dataOffset + chunkSize)
      dataOffset += chunkSize
    }
    if (dataLength - dataOffset > 0) {
      prefix = data.slice(dataOffset)
      prefixLength = dataLength - dataOffset
      dataOffset = dataLength
    }
  }
  if (prefix) {
    yield prefix; // Bad data file not this generator's problem.
    prefix = null, prefixLength = 0
  }
}

/**
 *  Method collates multiple stream readers into one iterator
 *  whose `next()` method returns an array of `Buffer`
 *  ... FINISH ...
 *  objects in the same order as incoming parameters and where
 *  each `value` is the `Buffer` returned by the corresponding
 *  stream reader.
 *
 *  Iteration terminates when all streams are exhausted.
 *
 *  When a stream is exhausted, `done` becomes `true` and `value`
 *  becomes `null`.  Iteration terminates when `done` becomes true
 *  for all returned objects.
 *
 *  @param {Iterable<Iterator>} ioi - Iterable of iterators
 *  @returns {Iterable<{ done: boolean, value: Buffer }>}
 *    List of results in same order as incoming iterable
 *  @see byId(Reader)
 *  @see bySize(Reader)
 */
async function* collate(ioi) {
  const iterators = []
  for (let k = 0, itor = null; k < ioi.length; ++k) {
    if (itor = getIterator(ioi[k]))
      iterators.push(itor)
    else
      throw Error(`Cannot locate iterator for collate input`
        + ` param[${k}] (${ioi[k]})`)
  }
  let more = true
  while (more) {
    const promises = iterators.map(elem => elem.next())
    const resolution = await Promise.all(promises)
    const rv = resolution.map(object => object.value)
    yield rv
    more = false
    resolution.forEach(object => {
      if (object.done === false) more = true
    })
  }
}

function getIterator(thing) {
  if (typeof thing.next === 'function')
    return thing // already an iterator
  else if (typeof thing[Symbol.iterator] === 'function')
    return thing[Symbol.iterator]() // synchronous
  else if (typeof thing[Symbol.asyncIterator] === 'function')
    return thing[Symbol.asyncIterator]() // asynchronous
  else
    return null
}

exports.byId = byId
exports['bySize'] = bySize
exports.collate = collate

// console.log(`\nmodule = %o`, module)
// console.log(`module.exports = %o`, module.exports)
// console.log(`exports = %o`, exports)
// console.log(`module.exports === exports = ${module.exports === exports}`)
