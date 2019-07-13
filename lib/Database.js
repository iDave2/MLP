/********************************************************************
 *  This class wraps MNIST Indexes and provides helpers for common
 *  operations like reading (image, label) in pairs.
 *
 *  TODO:  Finish documenting this puppy.
 */
'use strict'
const assert = require('assert')
const Index = require('./Index')
const { collate, bySize } = require('./streamutils')

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

    // console.log('new Database %o', this.database, '\n')
  }

  getIndices(dbName = 'training') {
    this.validateDbName(dbName)
    const database = this.database[dbName]
    return [database.images.instance, database.labels.instance]
  }

  getReader(dbName = 'training', begin = 0, count = null) {

    this.validateDbName(dbName)

    const imageIndex = this.database[dbName].images.instance
    const labelIndex = this.database[dbName].labels.instance

    const streams = [ // Really iterators over streams.
      bySize(imageIndex.getReader(begin, count), imageIndex.size),
      bySize(labelIndex.getReader(begin, count), labelIndex.size)
    ]

    return collate(streams) // Asynchronous multiplexer.
  }

  validateDbName(dbName) {
    const dbNames = Object.keys(this.database)
    assert(dbNames.includes(dbName), `Unknown database name "${dbName}"`
      + `, try something in [${dbNames}]`)
    return dbName
  }

}

module.exports = Database