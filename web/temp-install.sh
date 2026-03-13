#!/bin/bash
export http_proxy=""
export https_proxy=""
npm config delete proxy
npm config delete https-proxy
npm install vite-plugin-compression2 --save-dev
npm test
