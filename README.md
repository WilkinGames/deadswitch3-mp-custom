# Deadswitch 3 Multiplayer Server

## Overview
This repository allows you to host your own Deadswitch 3 multiplayer server.

## Requirements
You will need NPM and Node.js installed on the machine you wish to host the server on. 

Install NodeJS: https://nodejs.org/en/download/

NPM is automatically installed with Node.js.

## Hosting

### Hosting on Local PC
If you wish to host the server on your local PC, installing Node.js is free and quick to do. Note that this will only allow players on your LAN to connect, unless you have some sort of port-forwarding set up.

You will need to add a local proxy for LAN players to connect, since they will not be able to connect to a `localhost` URL. You can use https://github.com/icflorescu/iisexpress-proxy for this.

### Hosting on External Server
You can use a free/cheap Node.js app service to host the multiplayer server which will allow any player to join. Heroku is recommended.

## Instructions
Navigate to the directory in which you wish to install the Deadswitch 3 multiplayer server.

Clone this repository:
`git clone https://github.com/XWILKINX/ds3mp-custom`

Install the required dependencies:
`npm install`

Start the Deadswitch 3 multiplayer server:
`npm start`

## Updates

Server updates are frequently released. You'll need to stop and restart the server in order for changes to take effect.

To update the server code to the latest:
`git pull`

Then start the server again:
`npm start`

## Connecting to the Server
First, enable the `Use Custom Server` setting in-game. 

Enter the `Custom Server URL` you are using (the default is `localhost:8081`). This will typically be the server IP address.

## Additional Details
You can test and view the current server stats by visiting the server URL in your browser.

`Ranked > Multiplayer` will now connect to this custom server URL. Simply disable `Use Custom Server` to revert back to the public server list.

Note that access to Deadswitch 3 accounts and clans is disabled for custom servers for security reasons.
