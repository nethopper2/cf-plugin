#! /usr/bin/env node

const chalk = require('chalk')
const boxen = require('boxen')
const utils = require('./utils.js')
const translate = require('@vitalets/google-translate-api');
const usage = chalk.keyword('violet')("\nUsage: cf -k push ; while in the CF App manifest directory");
const yargs = require("yargs");

main()

async function main() {
    
    // console.log(process.argv)
    if(process.argv.includes('-k') || process.argv.includes('--kubernetes')){
        // console.log('argv = ', process.argv)
        var deleteManifest = false;
        var pushManifest = false;
        var showHelp = false;
        var verbose = false;
        if (process.argv.includes('-v')) {verbose = true};
        if (process.argv.includes('delete')) {deleteManifest = true};
        if (process.argv.includes('push')) {pushManifest = true};
        if (process.argv.includes('-h') || process.argv.includes('--help')) {showHelp = true};
        if ((deleteManifest == false && pushManifest == false) || showHelp) {
            utils.showHelp();
            return;
        }
        //Check CF App in Main routing
        let response;
        console.log("Checking CF APP to determine if it is ready to be pushed to KAOPS (Kubernetes GitOps)...\n");

        //Check for manifest.yml file
        response = await utils.checkForManifest(verbose);
        if (verbose == true) {console.log("response = " + JSON.stringify(response))};
        if (response.status != "pass") {
            return;
        }
        let filename = response.filename;
        
        //Validate fields in manifest.yml file
        response = await utils.verifyCFManifest(filename, verbose);
        if (verbose == true) {console.log("response = " + JSON.stringify(response))};
        if (response.status != "pass") {
            console.log("here")
            return;
        }
        let appName = response.appName;
        let appVersion = response.appVersion;
        let mainFile = response.mainFile;
        let serviceUrl = response.serviceUrl;
        let imageRepo = response.imageRepo;

        //Build Dockerfile
        response = await utils.buildDockerfile(mainFile, verbose);
        if (response.status != "pass") {
            return;
        }
        if (verbose == true) {console.log("response = " + JSON.stringify(response))};

        //Build Docker image
        response = await utils.buildDockerImage(imageRepo, appVersion, verbose);
        if (response.status != "pass") {
            return;
        }
        if (verbose == true) {console.log("response = " + JSON.stringify(response))};

        //Push Docker image
        response = await utils.pushDockerImage(imageRepo, appVersion, verbose);
        if (response.status != "pass") {
            return;
        }
        if (verbose == true) {console.log("response = " + JSON.stringify(response))};

        //Build Kubernetes Manifest
        response = await utils.buildKubeManifest(imageRepo, appVersion, serviceUrl, appName, verbose);
        if (response.status != "pass") {
            return;
        }
        if (verbose == true) {console.log("response = " + JSON.stringify(response))};

        //Git commit Kubernetes Manifest
        if (pushManifest == true) {
            response = await utils.commitKubeManifest(imageRepo, appVersion, serviceUrl, appName, verbose);
            // if (response.status != "pass") {
            //     return;
            // }
            if (verbose == true) {console.log("response = " + JSON.stringify(response))};
        }

        if (deleteManifest == true) {
            response = await utils.deleteKubeManifest(imageRepo, appVersion, serviceUrl, appName, verbose);
            // if (response.status != "pass") {
            //     return;
            // }
            if (verbose == true) {console.log("response = " + JSON.stringify(response))};
        }

        if (pushManifest == true) {
            console.log(`
Getting apps in kubernetes...

name\t\trequested state\t\tprocesses\t\troutes
${appName}\tstarted\t\t\t${mainFile}\t\t\t${serviceUrl}
`
            )
            
            await console.log(chalk.green.bold(`SUMMARY: You can now access your app with 'curl https://${serviceUrl}'\n`));
            return;    
        }

        
    }
}
