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

  static training = {
    'images': {
      fileName: MNIST + '/train-images-idx3-ubyte',
      instance: null,
    },
    'labels': {
      fileName: MNIST + '/train-labels-idx1-ubyte',
      instance: null,
    },
  }

  static testing = {
    'images': {
      fileName: MNIST + '/t10k-images-idx3-ubyte',
      instance: null,
    },
    'labels': {
      fileName: MNIST + '/t10k-labels-idx1-ubyte',
      instance: null,
    },
  }

  constructor() {
    for (const table of ['training', 'testing']) {
      for (const index of ['images', 'labels']) {
        const the = Database[table][index]
        if (null === the.instance) {
          // console.log(`Loading index for ${table}.${index}`)
          the.instance = new Index(the.fileName)
        }
      }
    }
  }

  getIndices(tableName = 'training') {
    this.validateTableName(tableName)
    const table = Database[tableName]
    return [table.images.instance, table.labels.instance]
  }

  getReader(table = 'training', begin = 0, count = null) {

    this.validateTableName(table)

    const imageIndex = Database[table].images.instance
    const labelIndex = Database[table].labels.instance

    const streams = [ // Really iterators over streams.
      bySize(imageIndex.getReader(begin, count), imageIndex.size),
      bySize(labelIndex.getReader(begin, count), labelIndex.size)
    ]

    return collate(streams) // Asynchronous multiplexer.
  }

  validateTableName(table) {
    assert(table === 'training' || table === 'testing',
      `Unknown table name "${table}"`
      + ", try something in ['training', 'testing']")
    return table
  }

}

module.exports = Database