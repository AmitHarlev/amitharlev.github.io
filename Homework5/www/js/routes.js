angular.module('app.routes', [])

.config(function($stateProvider, $urlRouterProvider) {

  // Ionic uses AngularUI Router which uses the concept of states
  // Learn more here: https://github.com/angular-ui/ui-router
  // Set up the various states which the app can be in.
  // Each state's controller can be found in controllers.js
  $stateProvider
    

      .state('tabsController.products', {
    url: '/page2',
    views: {
      'tab1': {
        templateUrl: 'templates/products.html',
        controller: 'productsCtrl'
      }
    }
  })

  .state('tabsController.location', {
    url: '/page3',
    views: {
      'tab2': {
        templateUrl: 'templates/location.html',
        controller: 'locationCtrl'
      }
    }
  })

  .state('tabsController.contactUs', {
    url: '/page4',
    views: {
      'tab3': {
        templateUrl: 'templates/contactUs.html',
        controller: 'contactUsCtrl'
      }
    }
  })

  .state('tabsController', {
    url: '/page1',
    templateUrl: 'templates/tabsController.html',
    abstract:true
  })

  .state('tabsController.home', {
    url: '/page5',
    views: {
      'tab4': {
        templateUrl: 'templates/home.html',
        controller: 'homeCtrl'
      }
    }
  })

$urlRouterProvider.otherwise('/page1/page5')


});