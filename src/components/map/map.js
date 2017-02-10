import React from "react";
import d3 from "d3";
import _ from "lodash";
import { connect } from "react-redux";
import Card from "../framework/card";
import setupLeaflet from "../../util/leaflet";
import setupLeafletPlugins from "../../util/leaflet-plugins";
import {drawTipsAndTransmissions} from "../../util/mapHelpers";
import * as globals from "../../util/globals";
import computeResponsive from "../../util/computeResponsive";
import getLatLongs from "../../util/mapHelpersLatLong";
import {
  MAP_ANIMATION_TICK,
  MAP_ANIMATION_END
} from "../../actions";

@connect((state) => {
  return {
    tree: state.tree.tree,
    metadata: state.metadata.metadata,
    colorBy: state.controls.colorBy,
    browserDimensions: state.browserDimensions.browserDimensions,
    map: state.map
  };
})
class Map extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      map: null,
      tips: false,
      d3DOMNode: null,
      d3elems: null,
      datasetGuid: null,
      responsive: null,
    };
  }
  componentWillMount() {
    setupLeaflet(); /* this sets up window.L */
  }
  componentDidMount() {
    setupLeafletPlugins(); /* this attaches several properties to window.L */
  }
  componentWillReceiveProps(nextProps) {
    /*
      React to browser width/height changes responsively
      This is stored in state because it's used by both the map and the d3 overlay
    */

    if (
      this.props.browserDimensions &&
      (this.props.browserDimensions.width !== nextProps.browserDimensions.width ||
      this.props.browserDimensions.height !== nextProps.browserDimensions.height)
    ) {
      const responsive = computeResponsive({
        horizontal: nextProps.browserDimensions.width > globals.twoColumnBreakpoint ? .5 : 1,
        vertical: 1, /* if we are in single column, full height */
        browserDimensions: nextProps.browserDimensions,
        sidebar: nextProps.sidebar,
        minHeight: 400,
        maxAspectRatio: 1.3,
      })
      this.setState({responsive})
    } else if (!this.props.browserDimensions && nextProps.browserDimensions) { /* first time */
      const responsive = computeResponsive({
        horizontal: nextProps.browserDimensions.width > globals.twoColumnBreakpoint ? .5 : 1,
        vertical: 1, /* if we are in single column, full height */
        browserDimensions: nextProps.browserDimensions,
        sidebar: nextProps.sidebar,
        minHeight: 400,
        maxAspectRatio: 1.3,
      })
      this.setState({responsive})
    }
  }
  componentDidUpdate(prevProps, prevState) {
    this.maybeSetupLeaflet(); /* puts leaflet in the DOM, only done once */
    this.maybeSetupD3DOMNode(); /* attaches the D3 SVG DOM node to the Leaflet DOM node, only done once */
    this.maybeDrawTipsAndTransmissions(); /* it's the first time, or they were just removed because we changed dataset */
    this.maybeUpdateTipsAndTransmissions(); /* every time we change something like colorBy */
    this.maybeAnimateTipsAndTransmissions();
    this.maybeRemoveAllTipsAndTransmissions(prevProps); /* dataset just changed */
  }
  maybeSetupLeaflet() {
    /* first time map, this sets up leaflet */
    if (
      this.props.browserDimensions &&
      this.props.metadata &&
      !this.state.map
    ) {
      this.createMap();
    }
  }
  maybeSetupD3DOMNode() {
    if (
      this.state.map &&
      this.state.responsive &&
      !this.state.d3DOMNode
    ) {
      /* add circles and lines to map, add event listeners for leaflet zooming */
      const mapSVG = d3.select(this.state.map.getPanes().overlayPane)
        .append("svg")
        .attr("width", this.state.responsive.width)
        .attr("height", this.state.responsive.height);
      const g = mapSVG.append("g").attr("class", "leaflet-zoom-hide");

      this.setState({d3DOMNode: g})
    }
  }
  maybeDrawTipsAndTransmissions() {
    if (
      this.props.colorScale &&
      this.state.map && /* we have already drawn the map */
      this.props.metadata && /* we have the data we need */
      this.props.nodes &&
      this.state.responsive &&
      this.state.d3DOMNode &&
      !this.state.tips /* we haven't already drawn tips */
    ) {
      /* data structures to feed to d3 latLongs = { tips: [{}, {}], transmissions: [{}, {}] } */
      const latLongs = this.latLongs();

      const d3elems = drawTipsAndTransmissions(
        latLongs,
        this.props.colorScale,
        this.state.d3DOMNode,
      );
      // this.state.map.on("viewreset", this.drawOverlay.bind(this));
      // this.state.map.on("moveend", this.drawOverlay.bind(this));

      // don't redraw on every rerender - need to seperately handle virus change redraw
      this.setState({
        tips: true,
        d3elems,
      });
    }
  }
  maybeUpdateTipsAndTransmissions() {
    /* todo */
  }
  maybeAnimateTipsAndTransmissions() {
    /* todo */
  }
  maybeRemoveAllTipsAndTransmissions(prevProps) {
    /* dataset change, remove all tips and transmissions d3 added */
    if (
      this.state.map && // we have a map
      prevProps.datasetGuid &&
      this.props.datasetGuid &&
      prevProps.datasetGuid !== this.props.datasetGuid // and the dataset has changed
    ) {
      this.state.d3DOMNode.selectAll("*").remove();

      /* clear references to the tips and transmissions d3 added */
      this.setState({
        map: null,
        tips: false,
        d3elems: null,
        latLongs: null,
      })
    }
  }
  latLongs() {
    return getLatLongs(
      this.props.nodes,
      this.props.metadata,
      this.state.map,
      this.props.colorBy
    );
  }
  createMap() {
    /******************************************
    * GET LEAFLET IN THE DOM
    *****************************************/

    const southWest = L.latLng(-70, -180);
    const northEast = L.latLng(80, 180);
    const bounds = L.latLngBounds(southWest, northEast);
    let zoom = 2;
    let center = [0,0];

    /*
      hardcode. this will last a while.
      when we want to dynamically calculate the bounds,
      map will have to know about the path latlongs calculated in maphelpers.
      not at all sure how we'll do that and account for great circle paths.
    */
    if (window.location.pathname.indexOf("ebola") !== -1) {
      zoom = 7;
      center = [8, -11];
    } else if (window.location.pathname.indexOf("zika") !== -1) {
      /* zika is fine at the default settings */
    }

    var map = L.map('map', {
      center: center,
      zoom: zoom,
      scrollWheelZoom: false,
      maxBounds: bounds,
      minZoom: 2,
      maxZoom: 9,
      zoomControl: false,
      /* leaflet sleep see https://cliffcloud.github.io/Leaflet.Sleep/#summary */
      // true by default, false if you want a wild map
      sleep: false,
      // time(ms) for the map to fall asleep upon mouseout
      sleepTime: 750,
      // time(ms) until map wakes on mouseover
      wakeTime: 750,
      // defines whether or not the user is prompted oh how to wake map
      sleepNote: true,
      // should hovering wake the map? (clicking always will)
      hoverToWake: false
    })

    L.tileLayer('https://api.mapbox.com/styles/v1/trvrb/ciu03v244002o2in5hlm3q6w2/tiles/256/{z}/{x}/{y}?access_token=pk.eyJ1IjoidHJ2cmIiLCJhIjoiY2l1MDRoMzg5MDEwbjJvcXBpNnUxMXdwbCJ9.PMqX7vgORuXLXxtI3wISjw', {
        attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors',
        // noWrap: true
    }).addTo(map);

    L.control.zoom({position: "bottomright"}).addTo(map);

    this.setState({map});
  }
  createMapDiv() {
    return (
      <div style={{position: "relative"}}>
        <button style={{
            position: "absolute",
            left: 25,
            top: 25,
            zIndex: 9999,
            border: "none",
            padding: 15,
            borderRadius: 4,
            backgroundColor: "rgb(124, 184, 121)",
            fontWeight: 700,
            color: "white"
          }}
          onClick={this.handleAnimationPlayClicked.bind(this)}>
          Play
        </button>
        <div style={{
            height: this.state.responsive.height,
            width: this.state.responsive.width
          }} id="map">
        </div>
      </div>
    )
  }
  handleAnimationPlayClicked() {
    /******************************************
    * ANIMATE MAP (AND THAT LINE ON TREE)
    *****************************************/
    this.animateMap();
  }
  animateMap() {
    let start = null;

      const step = (timestamp) => {
        if (!start) start = timestamp;

        let progress = timestamp - start;

        this.props.dispatch({
          type: MAP_ANIMATION_TICK,
          data: {
            progress
          }
        })

        if (progress < globals.mapAnimationDurationInMilliseconds) {
          window.requestAnimationFrame(step);
        } else {
          this.props.dispatch({ type: MAP_ANIMATION_END })
        }
      }

      window.requestAnimationFrame(step);
  }
  render() {
    // console.log('map sees', this.props.map)
    // clear layers - store all markers in map state https://github.com/Leaflet/Leaflet/issues/3238#issuecomment-77061011

    return (
      <Card center title="Transmissions">
        {this.props.browserDimensions ? this.createMapDiv() : "Loading"}
      </Card>
    );
  }
}

export default Map;
