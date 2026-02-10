const fs = require('fs');
const path = require('path');
const express = require('express');

const routesDir = path.join(__dirname, 'routes');
const files = fs.readdirSync(routesDir);

files.forEach(file => {
    if (file.endsWith('.js')) {
        console.log(`Checking ${file}...`);
        try {
            const router = require(path.join(routesDir, file));
            router.stack.forEach(layer => {
                if (layer.route) {
                    layer.route.stack.forEach(handlerLayer => {
                        if (typeof handlerLayer.handle !== 'function') {
                            console.error(`Error in ${file}: Handler for ${layer.route.path} is not a function (it is ${typeof handlerLayer.handle})`);
                        }
                    });
                }
            });
            console.log(`Finished ${file}`);
        } catch (err) {
            console.error(`Failed to load ${file}:`, err);
        }
    }
});
