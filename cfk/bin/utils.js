const chalk = require('chalk')
const usage = chalk.hex('#83aaff')("\nUsage: cf -k push ; while in the cf app manifest directory");
const folder = './';
const fs = require('fs');
var path = require('path');
const yaml = require('js-yaml');
const util = require('util');
const exec = util.promisify(require('child_process').exec);

module.exports = {deleteKubeManifest: deleteKubeManifest, showHelp: showHelp, commitKubeManifest: commitKubeManifest, buildKubeManifest: buildKubeManifest, pushDockerImage: pushDockerImage, buildDockerImage: buildDockerImage, buildDockerfile: buildDockerfile, verifyCFManifest: verifyCFManifest, checkForManifest: checkForManifest};

function showHelp() {
    console.log(usage);
    console.log('\nOptions:\r')
    console.log('\tpush\t\t      ' + 'Push an application to Kubernetes')
    console.log('\tdelete\t\t      ' + 'Delete an application from Kubernetes')
    console.log('\t--version\t      ' + 'Show version number.')
    console.log('    -k, --kubernetes\t' + '      ' + 'operate apps using Kubernetes GitOps')
    console.log('\t--help\t\t      ' + 'Show help.' + '\n')
}

async function checkForManifest() {
    console.log(chalk.yellow.bold("Checking present working directory for a CF App yaml manifest file"));
    var numManifests = 0
    var manifestFileName = ""
    await fs.readdirSync(folder).forEach(file => {
        if (file.includes(".yml")) {
            numManifests++
            manifestFileName = file
        }
    });
    if (numManifests == 0) {
        console.log(chalk.red.bold("ERROR: No CF App manifest files found"))
    } else if (numManifests == 1) {
        console.log(chalk.green.bold("PASS: 1 CF App manifest file found = " + manifestFileName))
        return {status: "pass", filename: manifestFileName}
    } else {
        console.log(chalk.green.bold("ERROR: More than 1 manifest file was found"))
    }
    return {status: "fail"}

}

async function verifyCFManifest(file) {
    console.log(chalk.yellow.bold("\nValidating CF App manifest File:"));

    const filePath = path.join(folder, file);
    var manifestFileData = await fs.readFileSync(filePath).toString();
    const yamlData = yaml.load(manifestFileData);
    const jsonData = JSON.stringify(yamlData);
    if (!manifestFileData) {
        console.log(chalk.red.bold("ERROR: No CF app manifest file found"))
        return {status: "fail"}
    }

    if (yamlData.applications[0].name) {
        var appName = yamlData.applications[0].name;
        console.log(chalk.green.bold("PASS: CF App Name = " + appName));    
    } else {
        await console.log(chalk.red.bold("ERROR: No CF App Name found in manifest.yml file"));
        return {status: "fail"};
    }

    if (yamlData.applications[0].env.VERSION) {
        var appVersion = yamlData.applications[0].env.VERSION;
        console.log(chalk.green.bold("PASS: CF App Version = " + appVersion));    
    } else {
        await console.log(chalk.red.bold("ERROR: No CF App VERSION env variable found in manifest.yml file"));
        return {status: "fail"};
    }

    if (yamlData.applications[0].env.MAINFILE) {
        var mainFile = yamlData.applications[0].env.MAINFILE;
        console.log(chalk.green.bold("PASS: CF App Main File  = " + mainFile));    
    } else {
        await console.log(chalk.red.bold("ERROR: No CF App MAINFILE env variable found (e.g. index.js) in manifest.yml file"));
        return {status: "fail"};
    }

    if (yamlData.applications[0].env.SERVICEURL) {
        var serviceUrl = yamlData.applications[0].env.SERVICEURL;
        console.log(chalk.green.bold("PASS: CF App Service URL  = " + serviceUrl));    
    } else {
        await console.log(chalk.red.bold("ERROR: No CF App SERVICEURL env variable found (e.g. nethopper/hello-world) in manifest.yml file"));
        return {status: "fail"};
    }

    if (yamlData.applications[0].env.IMAGEREPO) {
        var imageRepo = yamlData.applications[0].env.IMAGEREPO;
        console.log(chalk.green.bold("PASS: CF App Docker Image Repo URL  = " + imageRepo));    
    } else {
        await console.log(chalk.red.bold("ERROR: No CF App Docker IMAGEREPO env variable found (e.g. nethopper/hello-world) in manifest.yml file"));
        return {status: "fail"};
    }

    return {status: "pass", appName: appName, appVersion: appVersion, mainFile: mainFile, serviceUrl: serviceUrl, imageRepo: imageRepo}
}

async function buildDockerfile() {
    console.log(chalk.yellow.bold("\nBuilding Dockerfile:"));
    try {
        const filePath = path.join(folder, "./kube/Dockerfile");
        const data = dockerfileData()
        fs.writeFileSync(filePath, data);   
        await console.log(chalk.green.bold("PASS: Dockerfile written to ./kube/Dockerfile"));
        return {status: "pass"};         
        // file written successfully
    } catch (err) {
        await console.log(chalk.red.bold("ERROR: Unable to create or write Dockerfile to /kube/Dockerfile"))
        return {status: "fail"}
    }
}

async function buildDockerImage(imageRepo, appVersion, verbose) {
    console.log(chalk.yellow.bold("\nBuilding Docker Image:"));
    try {
        let command = `docker build -f ./kube/Dockerfile -t ${imageRepo}:${appVersion} .`;
        let response = await myCommand(command, verbose);
        // await console.log(response);
        if (response.stdout && response.stdout.includes("Successfully tagged ")) {
            await console.log(chalk.green.bold("PASS: Docker Image has been built"));
            return {status: "pass"}
            // docker image successfully built
        } else {
            await console.log(chalk.red.bold("ERROR: Unable to build Dockerfile 1"))
            return {status: "fail"}
        }
    } catch (err) {
        await console.log(chalk.red.bold("ERROR: Unable to build Dockerfile"))
        return {status: "fail"}
    }
}

async function pushDockerImage(imageRepo, appVersion, verbose) {
    console.log(chalk.yellow.bold("\nPushing Docker Image to Repository:"));
    try {
        let command = `docker push ${imageRepo}:${appVersion}`;
        let response = await myCommand(command, verbose);
        // await console.log(response);
        if (response.stdout && response.stdout.includes("The push refers to repository")) {
            await console.log(chalk.green.bold("PASS: Docker Image has been pushed"));
            return {status: "pass"}
            // docker image successfully built
        } else {
            await console.log(chalk.red.bold("ERROR: Unable to push Docker Image 1"))
            return {status: "fail"}
        }
    } catch (err) {
        await console.log(chalk.red.bold("ERROR: Unable to push Docker Image "))
        return {status: "fail"}
    }
}

async function buildKubeManifest(imageRepo, appVersion, serviceUrl, appName) {
    console.log(chalk.yellow.bold("\nBuilding Kubernetes GitOps Manifest:"));
    try {
        const filePath = path.join(folder, `./kube/${appName}.yaml`);
        // console.log('filepath = ', filePath);
        const data = kubeManifestData(imageRepo, appVersion, serviceUrl, appName)
        fs.writeFileSync(filePath, data);   
        await console.log(chalk.green.bold(`PASS: Kubernetes GitOps Manifest written to ${filePath}`));
        return {status: "pass"};         
        // file written successfully
    } catch (err) {
        await console.log(chalk.red.bold("ERROR: Unable to create Kubernetes GitOps Manifest"))
        return {status: "fail"}
    }
}

async function commitKubeManifest(imageRepo, appVersion, serviceUrl, appName, verbose) {
    console.log(chalk.yellow.bold("\nCommitting Kubernetes Manifest to Git"));
    try {
        let filePath = `./kube/${appName}.yaml`;
        let command;
        command = `git status`;
        // console.log("command", command, verbose)
        let response = await myCommand(command, verbose);
        // console.log("git push response", response)
        if (response.stdout && (!response.stdout.includes("Untracked files") && !response.stdout.includes("modified:") && !response.stdout.includes("added:") && !response.stdout.includes("deleted:"))) {
            await console.log(chalk.red.bold("ERROR: Your Kubernetes Manifest File has not changed, nothing to commit, have you bumped your version number in CF Manifest?"));
            return {status: "fail"}
        }

        await console.log(chalk.green.bold("PASS: There are changes to commit"));
        command = `sleep 1 && git add --all && git commit -m "committing manifest file ${filePath} version ${appVersion}" && git push`;
        // console.log("command", command, verbose)
        response = await myCommand(command, verbose);
        // console.log("git push response", response)
        // await console.log(response);
        if (response.stdout && response.stdout.includes("committing")) {
            await console.log(chalk.green.bold("PASS: Kubernetes Manifest committed"));
            return {status: "pass"}
        } else {
            await console.log(chalk.red.bold("ERROR: Unable to commit Kubernetes manifest 1"))
            return {status: "fail"}
        }
    } catch (err) {
        await console.log(chalk.red.bold("ERROR: Unable to commit Kubernetes manifest "))
        return {status: "fail"}
    }
}

async function deleteKubeManifest(imageRepo, appVersion, serviceUrl, appName, verbose) {
    console.log(chalk.yellow.bold("\nDeleting Kubernetes Manifest in Git"));
    try {
        let filePath = `./kube/${appName}.yaml`;
        let command;
        command = `rm ${filePath}`;
        // console.log("command", command, verbose)
        let response = await myCommand(command, verbose);
        command = `sleep 1 && git add --all && git commit -m "committing manifest file ${filePath} version ${appVersion}" && git push`;
        // console.log("command", command, verbose)
        response = await myCommand(command, verbose);
        // console.log("git push response", response)
        // await console.log(response);
        if (response.stdout && response.stdout.includes("committing")) {
            await console.log(chalk.green.bold("PASS: Kubernetes Manifest delete committed"));
            return {status: "pass"}
        } else {
            await console.log(chalk.red.bold("ERROR: Unable to commit Kubernetes manifest delete 1"))
            return {status: "fail"}
        }
    } catch (err) {
        await console.log(chalk.red.bold("ERROR: Unable to commit Kubernetes manifest delete"))
        return {status: "fail"}
    }
}



function dockerfileData() {
return `
FROM node:18

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./

RUN npm install
# If you are building your code for production
# RUN npm ci --omit=dev

# Bundle app source
COPY . .

EXPOSE 5000
CMD [ "node", "web.js" ]
`
}

function kubeManifestData(imageRepo, appVersion, serviceUrl, appName) {
return `
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${appName}
  namespace: nethopper
  labels:
    app: ${appName}
  annotations:
    nethopper.io/tag-edge: 'true'
spec:
  selector:
    matchLabels:
      app: ${appName}
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 25%
      maxSurge: 25%
  template:
    metadata:
      labels:
        app: ${appName}
    spec:
      containers:
        - name: ${appName}
          image: '${imageRepo}:${appVersion}'
          env:
          - name: RUNTIMEENV
            value: "Kubernetes GitOps"
          - name: VERSION
            value: ${appVersion}
          ports:
            - containerPort: 5000
              protocol: TCP
          resources: {}
          terminationMessagePath: /dev/termination-log
          terminationMessagePolicy: File
          imagePullPolicy: Always
      restartPolicy: Always
      terminationGracePeriodSeconds: 30
      dnsPolicy: ClusterFirst
      securityContext: {}
      schedulerName: default-scheduler
---
apiVersion: v1
kind: Service
metadata:
  annotations:
  labels:
    app.kubernetes.io/component: server
    app.kubernetes.io/name: ${appName}
    app.kubernetes.io/part-of: argocd
  name: ${appName}
  namespace: nethopper
spec:
  internalTrafficPolicy: Cluster
  ipFamilies:
  - IPv4
  ipFamilyPolicy: SingleStack
  ports:
  - name: http
    port: 80
    protocol: TCP
    targetPort: 5000
  - name: https
    port: 443
    protocol: TCP
    targetPort: 5000
  selector:
    app: ${appName}
  sessionAffinity: None
  type: ClusterIP
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${appName}
  namespace: nethopper
  annotations:
    nginx.ingress.kubernetes.io/backend-protocol: http
    cert-manager.io/cluster-issuer: letsencrypt-prod
    kubernetes.io/ingress.class: nginx
    kubernetes.io/tls-acme: 'true'
    nginx.ingress.kubernetes.io/force-ssl-redirect: 'true'
    nginx.ingress.kubernetes.io/ssl-redirect: 'true'
    nginx.ingress.kubernetes.io/tls-acme: 'true'
spec:
  tls:
    - hosts:
        - ${appName}.munford.mynethopper.net
      secretName: ${appName}-tls
  rules:
    - host: ${appName}.munford.mynethopper.net
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: ${appName}
                port:
                  number: 80
`
}
    
    
async function myCommand (command, verbose) {
    const { stdout, stderr } = await exec(command);
    if (verbose == true) {console.log('stdout:', stdout)};
    if (stderr) {
        // console.log('stderr:', stderr);
    }
    return { stdout, stderr };
}