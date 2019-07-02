/********************************************************************
 *  Handler for image/label (element) requests.
 *
 *  Note: cwd is '..' for this '../lib/script'...
*/

// console.log(`\nmodule = %o`, module)
// console.log(`module.exports = %o`, module.exports)
// console.log(`exports = %o`, exports)
// console.log(`module.exports === exports = ${module.exports === exports}`)

const fs = require('fs')
const IDX = require('./idx')
const { collate, bySize } = require('./streamutils')

'use strict'

const charset = 'utf-8' // TODO: Institutionalize this...
let database = 'training'

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

function loadIndex(forThis, begin, count) {
  return forThis.idx = new IDX(forThis.fileName, begin, count)
}

function logImageA(width, height, data) {
  let text = '\n' + '-'.repeat(width)
  for (let y = 0; y < height; ++y) {
    text += '\n'
    for (let x = 0; x < width; ++x) {
      const byte = data[y * width + x]
      text += byte ? 'X' : ' '
    }
  }
  text += '\n' + '-'.repeat(28)
  console.log(text)
}

const xhr = {

  async getElements(request, response, begin, count) {

    const { headers, method, url } = request

    // const cwd = process.cwd()

    const imgX = loadIndex(inputs[database].images, begin, count)
    const lblX = loadIndex(inputs[database].labels, begin, count)

    const streams = [
      bySize(imgX.reader, imgX.size),
      bySize(lblX.reader, lblX.size)
    ]
    const reader = collate(streams) // A multiplexer.

    // TODO: Just start writing into response stream as data
    // arrives.  Don't forget to prefix with header.

    let data = null
    try {
      let firstTime = true
      for await (data of reader) {

        if (typeof data[0] === 'undefined')
          break // normal termination

        if (firstTime) {
          firstTime = false
          response.statusCode = 200;
          response.setHeader('Content-Type', 'application/octet-stream');
        }

        let header = new Uint8Array(4)
        header[0] = data[1][0]    // label
        header[1] = imgX.dims[1]  // height, #rows
        header[2] = imgX.dims[2]  // width, #columns
        header[3] = 0

        let totalLength = 4 + imgX.size
        let buffer = Buffer.concat([header, data[0]], totalLength)

        // console.log(`xhr: sending ${totalLength} bytes`
        //   + `, index ${begin++}`)
        // logImageA(header[2], header[1], data[0])

        response.write(buffer)
      }
    }
    catch (reject) {
      throw reject
    }
    finally {
      response.end();
    }
  },

  async setDatabase(request, response, dbName = 'training') {
    if (dbName) dbName = dbName.toLowerCase()
    const abort = function (status, message) {
      console.error(message)
      response.statusCode = status
      response.setHeader('Content-Type', `text/plain; ${charset}`)
      response.end(message)
    }
    switch (dbName) {
      case 'training':
      case 'testing':
        database = dbName
        break
      default:
        return abort(404, `Unknown database (${dbName}), ignoring`)
    }
    const imgX = loadIndex(inputs[database].images, 0, 1)

    const message = `Set database to "${dbName}," ${imgX.dimString}`
    console.log(message)

    response.statusCode = 200
    response.setHeader('Content-Type', `text/plain; ${charset}`)
    const [count, height, width] = imgX.dims
    response.end(`count=${count}\nheight=${height}\nwidth=${width}\n`)
  },

}

exports.getElements = xhr.getElements
exports.setDatabase = xhr.setDatabase

// console.log(`\nmodule = %o`, module)
// console.log(`module.exports = %o`, module.exports)
// console.log(`exports = %o`, exports)
// console.log(`module.exports === exports = ${module.exports === exports}`)
