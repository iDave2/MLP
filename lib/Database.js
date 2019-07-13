/********************************************************************
 *  This class wraps MNIST Indexes and provides helpers for common
 *  operations like reading (image, label) in pairs.
 */
'use strict'
const assert = require('assert')
const Index = require('./Index')

// TODO: Generalize this, have it passed in, environment vars, etc.

const MNIST = 'MNIST' // Folder containing MNIST indices.

class Database {

  constructor() {

    this.database = {

      'training': {
        'images': {
          fileName: MNIST + '/train-images-idx3-ubyte',
          instance: null,
        },
        'labels': {
          fileName: MNIST + '/train-labels-idx1-ubyte',
          instance: null,
        },
      },

      'testing': {
        'images': {
          fileName: MNIST + '/t10k-images-idx3-ubyte',
          instance: null,
        },
        'labels': {
          fileName: MNIST + '/t10k-labels-idx1-ubyte',
          instance: null,
        },
      },
    }

    for (const dbName of ['training', 'testing']) {
      for (const elementType of ['images', 'labels']) {
        const index = this.database[dbName][elementType]
        index.instance = new Index(index.fileName)
      }
    }

    console.log(`new Database:\n${this.databases}`)
  }

  getReader(dbName = 'training', begin = 0, count = null) {

    const dbNames = Object.keys(this.database)
    assert(dbNames.includes(dbName), `Unknown database name "${dbName}"`
      + `, try something in [${dbNames}]`)

    if (this.database.dbName)
      console.log(`Database.getReader(${dbName}, ${begin}, ${count})`)
    else
      console.log('Database getReader foobar?')

    // function loadIndex(forThis) {
    //   return forThis.idx = new Index(forThis.fileName)
    // }
    // const imgX = loadIndex(database[cli.database].images)
    // const lblX = loadIndex(database[cli.database].labels)

    // const indices = [imgX, lblX]
    // let totalLengths = new Array(indices.length).fill(0)

    // const streams = [ // Really iterators over streams.
    //   bySize(imgX.getReader(cli.begin, cli.count), imgX.size),
    //   bySize(lblX.getReader(cli.begin, cli.count), lblX.size)
    // ]
    // const reader = collate(streams) // A multiplexer.

  }
}

module.exports = Database