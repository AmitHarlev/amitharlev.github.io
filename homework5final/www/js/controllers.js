angular.module('app.controllers', [])
  
.controller('productsCtrl', ['$scope', '$stateParams', // The following is the constructor function for this page's controller. See https://docs.angularjs.org/guide/controller
// You can include any angular dependencies as parameters for this function
// TIP: Access Route Parameters for your page via $stateParams.parameterName
function ($scope, $stateParams) {
    toys = [{
        source: "img/coloredrings.jpg",
        alt: "Colored Rings Toy",
        description: "A toy with multiple rings of different colors. There is also a wooden stand that they go on that has a variety of different length poles on it."
    },
    {
        source: "img/slinky.jpg",
        alt: "Slinky",
        description: "A metal slinky that anyone can have fun with. Whether it be having it walk down the stairs or just bouncing it up and down!"
    },
    {
        source: "img/playdoh.jpg",
        alt: "Play-Doh",
        description: "Who doesn't love playing with Play-Doh! This squishy substance will keep any child occupied for hours!"
    },
    {
        source: "img/letterblocks.jpg",
        alt: "3 Blocks with letters on them",
        description: "Have fun with your child while also teaching them letters and spelling! Make structures that spell words or just organize them in different patterns, the possibilities are endless!"
    },
    {
        source: "img/bowling.jpeg",
        alt: "Children's bowling toy",
        description: "Play bowling within the comforts of your very own house! Can be set up in any open space."
    }]
    
    
    $scope.groups = [];
      for (var i=0; i<5; i++) {
        $scope.groups[i] = {
          name: i+1,
          items: [toys[i]],
          show: false
        };
        //   $scope.groups[i].items.push("this is your toy");
      }
      
      /*
       * if given group is the selected group, deselect it
       * else, select the given group
       */
      $scope.toggleGroup = function(group) {
        group.show = !group.show;
      };
      $scope.isGroupShown = function(group) {
        return group.show;
      };
    
    $scope.isShowingToys = false
      $scope.showToys = function() {
          return $scope.isShowingToys;
      };
      $scope.toggleToys = function() {
        $scope.isShowingToys = !$scope.isShowingToys;
      };
    

}])
   
.controller('locationCtrl', ['$scope', '$stateParams', // The following is the constructor function for this page's controller. See https://docs.angularjs.org/guide/controller
// You can include any angular dependencies as parameters for this function
// TIP: Access Route Parameters for your page via $stateParams.parameterName
function ($scope, $stateParams) {


}])
   
.controller('contactUsCtrl', ['$scope', '$stateParams', // The following is the constructor function for this page's controller. See https://docs.angularjs.org/guide/controller
// You can include any angular dependencies as parameters for this function
// TIP: Access Route Parameters for your page via $stateParams.parameterName
function ($scope, $stateParams) {


}])
      
.controller('homeCtrl', ['$scope', '$stateParams', // The following is the constructor function for this page's controller. See https://docs.angularjs.org/guide/controller
// You can include any angular dependencies as parameters for this function
// TIP: Access Route Parameters for your page via $stateParams.parameterName
function ($scope, $stateParams) {


}])
 