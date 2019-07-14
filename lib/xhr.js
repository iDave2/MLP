/********************************************************************
 *  Handler for image/label (element) requests.
 *
 *  Note: cwd is '..' for this '../lib/script'...
*/
'use strict'

// console.log(`\nmodule = %o`, module)
// console.log(`module.exports = %o`, module.exports)
// console.log(`exports = %o`, exports)
// console.log(`module.exports === exports = ${module.exports === exports}`)

const fs = require('fs')
const Database = require('./Database')

const charset = 'utf-8' // TODO: Institutionalize this...

const xhr = {

  async getElements(request, response, table, begin, count) {

    const { headers, method, url } = request

    const database = new Database()
    const indices = database.getIndices(table) // [imageIndex, labelIndex]
    const reader = database.getReader(table, begin, count)

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
        header[0] = data[1][0]          // label
        header[1] = indices[0].dims[1]  // height, #rows
        header[2] = indices[0].dims[2]  // width, #columns
        header[3] = 0

        let totalLength = 4 + indices[0].size
        let buffer = Buffer.concat([header, data[0]], totalLength)

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

  /******************************************************************
   *  Return database meta-info to client.
   */
  async getDatabase(request, response) {

    const abort = function (status, message) {
      console.error(message)
      response.statusCode = status
      response.setHeader('Content-Type', `text/plain; ${charset}`)
      response.end(message)
    }

    // Grab database and indices for all tables.

    const database = new Database()
    const [trainingIndex] = database.getIndices('training')
    const [testingIndex] = database.getIndices('testing')

    // Return meta-info in friendly structure.

    response.statusCode = 200
    response.setHeader('Content-Type', `text/plain; ${charset}`)
    const body = {
      training: {
        table: 'training',
        length: trainingIndex.length,  // or dims[0]
        width: trainingIndex.dims[1],
        height: trainingIndex.dims[2]
      },
      testing: {
        table: 'testing',
        length: testingIndex.length,  // or dims[0]
        width: testingIndex.dims[1],
        height: testingIndex.dims[2]
      }
    }
    response.end(JSON.stringify(body))
  }
  // async setDatabase(request, response, table = 'training') {
  //   if (table) table = table.toLowerCase()
  //   const abort = function (status, message) {
  //     console.error(message)
  //     response.statusCode = status
  //     response.setHeader('Content-Type', `text/plain; ${charset}`)
  //     response.end(message)
  //   }
  //   switch (table) {
  //     case 'training':
  //     case 'testing':
  //       database = table
  //       break
  //     default:
  //       return abort(404, `Unknown database (${table}), ignoring`)
  //   }
  //   const imgX = loadIndex(inputs[database].images, 0, 1)

  //   const message = `Set database to "${table}," ${imgX.dimString}`
  //   console.log(message)

  //   response.statusCode = 200
  //   response.setHeader('Content-Type', `text/plain; ${charset}`)
  //   const [count, height, width] = imgX.dims
  //   response.end(`count=${count}\nheight=${height}\nwidth=${width}\n`)
  // },

}

exports.getDatabase = xhr.getDatabase
exports.getElements = xhr.getElements

// console.log(`\nmodule = %o`, module)
// console.log(`module.exports = %o`, module.exports)
// console.log(`exports = %o`, exports)
// console.log(`module.exports === exports = ${module.exports === exports}`)

// OLD NOTES:
//
// function logImageA(width, height, data) {
//   let text = '\n' + '-'.repeat(width)
//   for (let y = 0; y < height; ++y) {
//     text += '\n'
//     for (let x = 0; x < width; ++x) {
//       const byte = data[y * width + x]
//       text += byte ? 'X' : ' '
//     }
//   }
//   text += '\n' + '-'.repeat(28)
//   console.log(text)
// }
