const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

// --- Configuration ---
const port = process.env.PORT || 8080;
let testDataInterval = null;

// --- Fleet Simulation for Test Data (with numerical IDs) ---
const testVehicleFleet = {
    '30': { vehicle_id: '30', speed: 65, fuel_consumption: 7.2, platooning_status: true, efficiency_score: 88, co2_emission: 166 },
    '33': { vehicle_id: '33', speed: 64, fuel_consumption: 7.1, platooning_status: true, efficiency_score: 91, co2_emission: 164 },
    '45': { vehicle_id: '45', speed: 80, fuel_consumption: 8.9, platooning_status: false, efficiency_score: 75, co2_emission: 205 },
    '51': { vehicle_id: '51', speed: 0, fuel_consumption: 0.5, platooning_status: false, efficiency_score: 99, co2_emission: 11.5 }
};

// Create an HTTP server
const server = http.createServer((req, res) => {
    // --- Data Endpoint for CARLA ---
    if (req.method === 'POST' && req.url === '/data') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                console.log('[Server] Received real data from simulation:', data);
                
                if (testDataInterval) {
                    clearInterval(testDataInterval);
                    testDataInterval = null;
                    console.log('[Server] Real data received, stopping test data generator.');
                }

                const vehicles = Array.isArray(data.vehicles) ? data.vehicles : [data];
                
                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ vehicles }));
                    }
                });
                
                res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(JSON.stringify({ status: 'success' }));
            } catch (e) {
                console.error("Error parsing incoming data:", e);
                res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(JSON.stringify({ status: 'error', message: 'Invalid JSON' }));
            }
        });
        return;
    }

    // --- Static File Serving for Frontend ---
    let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
    let extname = String(path.extname(filePath)).toLowerCase();
    let mimeTypes = {
        '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
        '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpg',
        '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg',
    };
    let contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            res.writeHead(404, { 'Content-Type': 'text/html' });
            res.end('<h1>404 Not Found</h1>', 'utf-8');
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

// Attach the WebSocket server
const wss = new WebSocket.Server({ server });

wss.on('connection', ws => {
    console.log(`[Server] New client connected. Total clients: ${wss.clients.size}`);

    if (!testDataInterval && wss.clients.size === 1) {
        console.log('[Server] First client connected. Starting test data generator.');
        testDataInterval = setInterval(() => {
            const vehicleIds = Object.keys(testVehicleFleet);
            const vehiclesToSend = vehicleIds.map(id => {
                const vehicle = testVehicleFleet[id];
                // Simulate realistic changes
                vehicle.speed += (Math.random() - 0.5) * 4;
                if (vehicle.speed < 0) vehicle.speed = 0;
                if (vehicle.speed > 0) {
                    vehicle.fuel_consumption = 3 + (vehicle.speed / 10) + (Math.random() - 0.5);
                } else {
                    vehicle.fuel_consumption = 0.5;
                }
                vehicle.co2_emission = vehicle.fuel_consumption * 23.1;
                vehicle.efficiency_score += (Math.random() - 0.5) * 2;
                if(vehicle.efficiency_score > 100) vehicle.efficiency_score = 100;
                if(vehicle.efficiency_score < 50) vehicle.efficiency_score = 50;

                return { ...vehicle }; // Return a copy
            });
            
            const payload = JSON.stringify({ vehicles: vehiclesToSend });
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(payload);
                }
            });
        }, 2000); // Send updates for the whole fleet every 2 seconds
    }

    ws.on('close', () => {
        console.log(`[Server] Client disconnected. Remaining: ${wss.clients.size}`);
        if (wss.clients.size === 0 && testDataInterval) {
            clearInterval(testDataInterval);
            testDataInterval = null;
            console.log('[Server] Last client disconnected. Stopped test data generator.');
        }
    });
    ws.on('error', (error) => console.error('[Server] WebSocket error:', error));
});

server.listen(port, () => {
    console.log(`[Server] HTTP and WebSocket server started on port ${port}`);
});

