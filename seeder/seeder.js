import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { readFile } from 'fs/promises';

import { clean, orphans } from './src/clean.js';
import { load } from './src/load.js';
import { transform, transformSanitize, transformDefault } from './src/transform.js';
import { extend } from './src/extend.js';
import { store } from './src/store.js';
import { geojson, link } from './src/convert.js';

import { attachExitHandler, attachExceptionHandler } from '../utils.js';

// Read config file
dotenv.config({ path: '../.env' });
const configs = JSON.parse(await readFile('config.json'));

// Create database connection
await mongoose.connect(process.env.MONGO_URL);
attachExitHandler(() => mongoose.disconnect());
attachExceptionHandler(() => mongoose.disconnect());

// Import and process GTFS data
const processAgency = async config => {
    let { agency, stops, routes } = await load(config);
    
    // Config-specified transformations
    config.transformations?.forEach(transformation => {
        const [ dataset, source ] = transformation.source.split('.');
        
        if (dataset == 'stops') {
            stops = stops.map(stop => transform(stop, transformation));
        }
        
        if (dataset == 'routes' || source == 'stop_id') {
            routes = routes.map(route => transform(route, transformation));
        }
    });
    
    // Remove disallowed characters
    stops = stops.map(stop => transformSanitize(stop));
    routes = routes.map(route => transformSanitize(route));
    
    // Supplement with Sanity CMS data
    ({ agency, stops, routes } = await extend(agency, stops, routes, config.id));
    
    // General transformations
    stops = stops.map(stop => transformDefault(stop, { id: config.id }));
    routes = routes.map(route => transformDefault(route, { id: config.id }));
    
    // Set base data for review-enabled agencies
    if (config.reviews) {
        stops = stops.map(stop => (stop.wheelchair_boarding = 0, stop));
        stops = stops.map(stop => (stop.stop_tags = [], stop));
    }
        
    // Merge agency constants into object for storage
    agency.agency_default = configs.default == config.id;
    agency.agency_vehicle = config.vehicle;
    agency.agency_reviews = config.reviews;
    
    return { agency, stops, routes };
};

let datasets = [];
for await (let config of configs.agencies) {
    datasets.push(await processAgency(config));
}

// Combine nearby stops from different agencies
datasets = await link(datasets);

// Merge the datasets from each agency into one
let { agency: agencies, stops, routes } = datasets.reduce((result, current) => {
    Object.keys(current ?? {}).forEach(key => {
        if (!result[key]) { result[key] = []; }
        Array.isArray(current[key]) ?
            result[key].push(...current[key]) :
            result[key].push(current[key]);
    });
    return result;
}, {});
datasets = undefined;

// Check for broken references before storing data
const orphaned = await orphans(stops);
if (orphaned.length) {
    orphaned.forEach(orphan => {
        console.error("Import error: Stop '" + orphan + "' is reviewed but wasn't imported.");
    });
    
    console.error("Exiting without change due to fatal error.");
    
    await mongoose.disconnect();
    process.exit();
}

// Remove existing database data
await clean();

// Store everything in Redis database
await store(agencies, stops, routes);

// Convert to GeoJSON and optionally upload to Mapbox
await geojson(stops, routes);

await mongoose.disconnect();