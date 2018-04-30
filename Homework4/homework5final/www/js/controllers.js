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

  window.onload = getLocation();      //might not need this
  var geo = navigator.geolocation; 

  function getLocation() {       
      if(geo) {    
              geo.getCurrentPosition(displayLocation, function (error){
                  alert("There was an error finding your location")
              });       
          }
          else {
              alert("Oops, Geolocation API is not supported");        
          }     
  }           

  function displayLocation(position) {         
      var latitude = position.coords.latitude;        
      var longitude = position.coords.longitude;            
      $scope.latitude = latitude;
      $scope.longitude = longitude 
    //   div.innerHTML = "You are at Latitude: " + latitude + ", Longitude: " + longitude;

      displayMap(position.coords);
  }

  var map;

  function displayMap(coords) {
      var googleLatAndLong = new google.maps.LatLng(coords.latitude, coords.longitude);

      var mapOptions = {
          zoom: 16,
          center: googleLatAndLong,
          mapTypeId: google.maps.MapTypeId.ROADMAP,
      };

    //   var mapDiv = document.getElementById('map');
    //   map = new google.maps.Map(mapDiv, mapOptions);

      var title = 'Your Location';
      var content = 'You are here: ' + coords.latitude + ', ' + coords.longitude;
      addMarker(map, googleLatAndLong, title, content);
  }

//   function addMarker (map, latlong, title, content) {
//           var markerOptions = {
//               position: latlong,
//               map: map,
//               title: title,
//               clickable: true
//           };

//           var marker = new google.maps.Marker(markerOptions);
//           var infoWindowOptions = {
//               content: content,
//               position: latlong
//           };

//           var infoWindow = new google.maps.InfoWindow(infoWindowOptions);
//           google.maps.event.addListener(marker, 'click', function() {
//           infoWindow.open(map);

//           });
//       }

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
 