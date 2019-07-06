/********************************************************************
 *  Program to test using average input vectors as basis of a
 *  #category-dimensional space.
 */


let button = null
let div = null
let startTime = null // milliseconds

function initTraining() {
  console.log('Welcome to init training')

  div = document.querySelector(".training div")

  button = document.getElementById('goTraining')
  button.addEventListener('click', onGoTraining)
}

function onGoTraining(event) {
  startTime = Date.now()
  runBasisA()
}

function log(what) {

  let elapsed = Date.now() - startTime
  elapsed = Math.floor(Math.round(elapsed * 1000)) / 1000

  const message = `<p>${elapsed}: ${what}</p>`
  div.innerHTML += message
  div.scrollTop = div.scrollHeight
}

async function runBasisA() {
  //console.dir(div)
  log(`Running basisA`)
  log(`Set database to "training"`)
  try {
    await setDatabaseA('training')
    await train()
    //return 'Do not forget to return something!'
  } catch (err) {
    log(`Error from somewhere: ${err}`)
  }
}

let index = 0

async function train() {
  log(`Program allegedly training now...`)
  const reader = readerA()
  for await (element of reader) {
    log(`Got element ${index++} (${element}) from readerA!`)
  }
}

async function* readerA(begin = 0, count = null) {
  for (let i = 0; i < 5; ++i)
    yield i
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
