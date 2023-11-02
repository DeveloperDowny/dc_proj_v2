const mongoose = require("mongoose");
const Document = require("./Document");

const cluster = require("node:cluster");
const http = require("node:http");
const numCPUs = require("node:os").availableParallelism();
const process = require("node:process");
const { setupMaster, setupWorker } = require("@socket.io/sticky");
const { createAdapter, setupPrimary } = require("@socket.io/cluster-adapter");
const { Server } = require("socket.io");
const { info } = require("node:console");
const express = require("express");
const redisAdapter = require('socket.io-redis');

const cors = require("cors"); // Import the cors middleware

const Redis = require("ioredis");
mongoose.connect(
  "mongodb+srv://varshil:VaHOnbDuXZCku8vu@url-shortner.bknujel.mongodb.net/url-shortner?retryWrites=true&w=majority",
  {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useFindAndModify: false,
    useCreateIndex: true,
  }
);

const defaultValue = "";

async function findOrCreateDocument(id) {
  if (id == null) return;

  const document = await Document.findById(id);
  if (document) return document;
  return await Document.create({ _id: id, data: defaultValue });
}

// if (cluster.isMaster) {
if (cluster.isMaster) {
  console.log("Primary node");
  const httpServer = http.createServer();
  // httpServer.listen(3000);
  // httpServer.listen(5000);

  setupMaster(httpServer, {
    loadBalancingMethod: "least-connection",
  });

  setupPrimary();
  // cluster.setUpPrimary({
  //   serialization: "advanced",
  // });
  cluster.setupMaster({
    serialization: "advanced",
  });

  httpServer.listen(3001);

  // for (let i = 0; i < numCPUs; i++) {
  for (let i = 0; i < 3; i++) {
    cluster.fork();
  }

  cluster.on("exit", (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died`);
  });
} else {
  // worker threads

  console.log(`Worker ${process.pid} started`);
  // const redisClient = new Redis(
  //   "rediss://red-cl1tce3mgg9c73e8p9m0:M3lN8K9hk9iLO2beOsJjXLSQJ5rFkV1z@oregon-redis.render.com:6379"
  // );

  // creating Express and Socket server and binding them to HTTP Server
  const app = express();
  const httpServer = http.createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "http://localhost:3000",
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  app.use(
    cors({
      origin: "http://localhost:3000", // Allow requests from this origin
      methods: "GET,POST", // Allow GET and POST requests
      credentials: true, // Allow cookies and authentication headers
    })
  );

  // you might need some different kind of adapter here
  io.adapter(createAdapter());
  // io.adapter(createAdapter(redisClient));

  setupWorker(io);

  io.on("connection", (socket) => {
    console.log("connected to socket in process", process.pid);
    socket.on("get-document", async (documentId) => {
      const document = await findOrCreateDocument(documentId);
      socket.join(documentId);
      socket.emit("load-document", document.data);

      socket.on("send-changes", (delta) => {
        socket.broadcast.to(documentId).emit("receive-changes", delta);
      });

      socket.on("save-document", async (data) => {
        // console.log("saving document in process id ", process.pid, data);
        await Document.findByIdAndUpdate(documentId, { data });
      });
    });
  });
}
