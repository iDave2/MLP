/********************************************************************
 *  Program to test using average input vectors as basis of a
 *  #category-dimensional space.
 */

let trainingButton = null

function initTraining() {
  console.log('Welcome to init training')
  trainingButton = document.getElementById('goTraining')
  trainingButton.addEventListener('click', onGoTraining)
}

function onGoTraining(event) {
  console.log('Hello, Training!')
}