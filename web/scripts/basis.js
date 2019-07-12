/********************************************************************
 *  Program to test using average input vectors as basis of a
 *  #category-dimensional space.
 */

'use strict'

/*
 *  Debugging aid, a bitmap that activates:
 *
 *    0x01 - log fetch activity
 */
// TODO: we need namespaces, this debug is global, causes errors.
const myDebug = 0x01

let button = null
let div = null
let startTime = null // milliseconds

// Put this, or facsimile, in a utilities module somewhere...
function whatis(it) {

  function findName(that) { // assuming that instanceof Object
    if (that.hasOwnProperty('prototype')) { // a function
      if (that.hasOwnProperty('name') && typeof that.name === 'string')
        return that.name + '()'   // always shadowed?
      else {
        if (that.prototype.hasOwnProperty('constructor'))
          return that.prototype.constructor.name + '()' // original name
        else
          return '()' // MDN examples sometimes whack entire prototype...
      }
    }
    if (that.hasOwnProperty('constructor')) // inherited function prototype
      return that.constructor.name + '()'
    return typeof that // object or primitive
  }

  let what
  if (it === null) {
    what = 'null object'
  } else if (it instanceof Object) {
    what = findName(it)
    for (let i = 0; i < 15; ++i) { // avoid infinity
      let proto = Object.getPrototypeOf(it) // __proto__, not prototype
      if (proto === null)
        break // end of chain
      what += ` -> ${findName(proto)}`
      it = proto
    }
  } else {
    what = typeof it  // includes undefined
  }

  console.log(what)
}

/////////////////////////////////////////////////////////////////////

function initTraining() {
  console.log('Welcome to init training')

  div = document.querySelector(".training div")

  button = document.getElementById('goTraining')
  button.addEventListener('click', onClickTraining)
}

function onClickTraining(event) {
  startTime = Date.now()
  runBasisA()
}

function log(what) {
  let elapsed = Date.now() - startTime // milliseconds
  div.innerHTML += `<p>${elapsed}: ${what}</p>`
  div.scrollTop = div.scrollHeight
}

/////////////////////////////////////////////////////////////////////


async function runBasisA() {
  fetchElements('training', 0)
    .then(async function (reader) {
      console.debug('runBasisA: reader = %o', reader)
      for await (const {value, done} of reader) {
        console.debug('got a chunk, length = ' + value.length
          + ', done = ' + done)
      }
      console.debug('done with for await')
    })
  return
  log(`Running basisA`)
  try {
    log(`Set database to "training"`)
    await setDatabaseA('training')
    log(`Train`)
    await train()
    log('Finished running basisA')
    //return 'Do not forget to return something!'
  } catch (err) {
    log(`Error from somewhere: ${err}`)
  }
}

/////////////////////////////////////////////////////////////////////

class AsyncReader {
  constructor(reader) {
    this.reader = reader // stream.getReader() // and locked...
    this[Symbol.asyncIterator] = async function* () {
      yield this.reader.read()
    }
    this.thing = this[Symbol.asyncIterator](this.reader)
  }
  read() {
    return this.reader.read()
  }
}

/////////////////////////////////////////////////////////////////////

function fetchElements(database = 'training', begin = 0, count = null) {
  var test = JSON.stringify({
    database: database,
    begin: begin,
    count: count,
  })
  const params = new URLSearchParams({
    database: database,
    begin: begin,
    count: count,
  })
  const init = {
    method: 'POST',
    body: params,
  }
  if (myDebug & 0x01) {
    console.debug('fetchElements(' + database + ', '
      + begin + ', ' + count + ')')
  }
  return fetch('/getElements', init)
    .then(response => {
      console.debug('fetchElements: response = %o', response)
      return new AsyncReader(response.body.getReader())
    })
}

/////////////////////////////////////////////////////////////////////

async function train() {
  log(`Program allegedly training now...`)

  const params = new URLSearchParams({
    begin: 0,
    count: 2,
  })
  const init = {
    method: 'POST',
    body: params,
  }
  if (myDebug & 0x01) console.group("fetch('/getElements')")
  fetch('/getElements', init)
    .then(response => {
      if (myDebug & 0x01) {
        console.debug("response.headers.get('Content-Length') = "
          + response.headers.get('Content-Length')
          + '\n  // this is null when total length is unknown')
      }

      // let defaultReader = response.body.getReader()

      // let test1 = (async function* asyncReader(reader) {
      //   this.reader = reader
      //   this.read = function() { return this.reader.read() }
      //   yield this.reader.read()
      // })(defaultReader)

      let test2 = new AsyncReader(response.body)

      return test2
    })
    .then(async function (asyncReader) {
      let foo = await asyncReader.read
      // let foo = await asyncReader[Symbol.asyncIterator]
      // let foo = await asyncReader.thing
      let bar = 'none'

      /*
       *  Nodejs stream.Readable is asyncIterable.
       *  JavaScript ReadableStream is not?
       *  So try wrapping it in an asynchronous blanket.
       */
      // async function* asyncReader(bookWorm) {
      //   yield bookWorm.read()
      // }
      // return asyncReader(reader)
      // return async function* (reader)

      // for await (const data of reader) {
      //   console.debug(`got some data, done = ${data.done}`)
      // }
      // return 'something'

      // Yay! This works.
      // let test = await reader.read()
      // let foo = test
      // return foo

    })
    .then(async function (asyncIterator) {
      for await (let data of asyncIterator) {
        if (myDebug & 0x01) console.debug('got a chunk')
      }
    })
    .finally(() => {
      if (myDebug & 0x01) console.groupEnd()
    })

  return

  const reader = readerA()
  let index = -1
  for await (let element of reader) {
    ++index
    if (index % 1000 === 0) {
      // log(`index > 0, index % 10 is ${index % 10}`)
      log(`Got element ${index} "${element}" from readerA`)
      // } else {
      //   log(`index %10 nonzero`)
    }
  }
}

async function* readerA(begin = 0, count = null) {

  if (count === null) count = 60000
  console.error(`readerA: count is ${count}`)

  let xhr = new XMLHttpRequest;
  console.log('UNSENT: ', xhr.status);

  xhr.open("POST", '/getElements');
  console.log('OPENED: ', xhr.status);

  xhr.setRequestHeader('Content-Type', 'text/plain')
  xhr.responseType = "arraybuffer";

  const params = new URLSearchParams()
  params.append('begin', begin)
  params.append('count', count)

  xhr.onprogress = function (event) {
    const arrayBuffer = xhr.response;
    const uint8 = new Uint8Array(arrayBuffer)
    const responseSize = uint8.length
    console.log(`PROGRESS: xhr.status ${xhr.status}`
      + `, response length = ${responseSize}`
      + `, event.loaded ${event.loaded}`
      + `, event.total ${event.total}`)
    //    yield 2
  };

  xhr.onload = function (event) {
    console.log('LOAD (DONE): xhr.status = ' + xhr.status
      + `, xhr.responseSize ${xhr.responseSize}`
      + `, event.loaded ${event.loaded}`)
    //    yield 'XHR_ON_LOAD'
  };

  xhr.send(params);
}

/////////////////////////////////////////////////////////////////////

function _yaGetElements(resolve, reject, begin, count, prepend) {

  // // Validate and/or clamp input (may crash).

  // begin = State.validateIndex(begin)

  // if (count === null)
  //   count = CS.countHint()
  // else
  //   count = Math.max(1, parseInt(count))

  // Cache common dimensions.

  const headerSize = 4  // Header contains label.
  const imageSize = database.width * database.height // 28x28
  const elementSize = headerSize + imageSize
  const requestSize = elementSize * count

  // Buffer if prepending; then iterate backwards.

  const buffer = []

  // Make the request.

  var xhr = new XMLHttpRequest();
  xhr.open("POST", '/getElements');
  xhr.setRequestHeader('Content-Type', 'text/plain')
  xhr.responseType = "arraybuffer";
  const params = new URLSearchParams()
  params.append('begin', begin)
  params.append('count', count)

  /*
   *  Node seems to return all requested elements in one fell
   *  swoop for counts at least up to 100:
   *
   *  TODO: review XHR; you are ignoring status, readyState...
   */
  xhr.onload = function (event) {

    // Save final focus for old data before writing new data.
    // CS.focus will be NaN if this is first fetch.

    const finalFocus = CS.focus || 0

    // Write new elements.

    const arrayBuffer = xhr.response;
    const uint8 = new Uint8Array(arrayBuffer)
    const responseSize = uint8.length
    if (debug & 0x01) {
      console.debug(`onload: requested ${requestSize} bytes`
        + `, got ${responseSize}, begin = ${begin}`)
    }

    let i = 0, index = begin
    for (; i + elementSize <= responseSize; i += elementSize, ++index) {
      let header = uint8.slice(i, i + headerSize)
      let [label, height, width] = header.slice(0, 3)
      let data = uint8.slice(i + headerSize, i + headerSize + imageSize)
      const canvas = makeCanvas(data, width, height, label, index)
      if (prepend) {
        buffer.push(canvas)
      } else {
        CS.add(canvas, index)
      }
    }
    if (i < responseSize) {
      console.error(`xhr.onload: unexpected partial elements!`)
    }

    if (prepend) {
      index = CS.begin - 1
      for (let i = buffer.length - 1; 0 <= i; --i)
        CS.add(buffer[i], index--)
    }

    resolve(finalFocus)  // TODO: status, readyState, etc...
  }

  xhr.send(params)
}

/////////////////////////////////////////////////////////////////////

async function setDatabaseA(dbName = 'training') {
  let dummy = function (something) { }
  _setDatabase(dummy, dummy, dbName)
}
