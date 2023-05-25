var URL = require("url");
var http = require("http");
var cuid = require("cuid");
var Corsify = require("corsify");
var sendJson = require("send-data/json");
var ReqLogger = require("req-logger");
var healthPoint = require("healthpoint");
var HttpHashRouter = require("http-hash-router");
var redis = require("./redis");
var {
  creatTarget,
  getTargetById,
  getTargets,
  updateTargetById,
  intializeTargetSchema,
} = require("./target");
var version = require("../package.json").version;
var router = HttpHashRouter();
var logger = ReqLogger({ version: version });
var health = healthPoint({ version: version }, redis.healthCheck);
var cors = Corsify({
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, accept, content-type",
});
intializeTargetSchema();
router.set("/favicon.ico", empty);
router.set("/targets", async (req, res) => {
  if (req.method === "POST") creatTarget(req, res);
  if (req.method === "GET") getTargets(req, res);
});
router.set("/targets/:id", async (req, res) => {
  if (req.method === "POST") updateTargetById(req, res);
  if (req.method === "GET") getTargetById(req, res);
});
router.set("/route", async (req, res) => {
  if (req.method === "POST") takeDecision(req, res);
});

module.exports = function createServer() {
  return http.createServer(cors(handler));
};

async function handler(req, res) {
  if (req.url === "/health") return health(req, res);

  req.id = cuid();
  logger(req, res, { requestId: req.id }, function (info) {
    info.authEmail = (req.auth || {}).email;
    console.log(info);
  });
  router(req, res, { query: getQuery(req.url) }, onError.bind(null, req, res));
}

function onError(req, res, err) {
  if (!err) return;

  res.statusCode = err.statusCode || 500;
  logError(req, res, err);

  sendJson(req, res, {
    error: err.message || http.STATUS_CODES[res.statusCode],
  });
}

function logError(req, res, err) {
  if (process.env.NODE_ENV === "test") return;

  var logType = res.statusCode >= 500 ? "error" : "warn";

  console[logType](
    {
      err: err,
      requestId: req.id,
      statusCode: res.statusCode,
    },
    err.message
  );
}

function empty(req, res) {
  res.writeHead(204);
  res.end();
}

function getQuery(url) {
  return URL.parse(url, true).query; // eslint-disable-line
}

async function takeDecision(req, res) {
  let body = "";
  req.on("data", (chunk) => {
    body += chunk.toString();
  });
  req.on("end", async () => {
    body = JSON.parse(body);

    let hour = new Date(body.timestamp).getUTCHours();
    let result = await redis.ft.search("idx:targets", "*");
    let filteredResult = result.documents
      ?.filter((t) => {
        console.log(t);
        return (
          t.value.accept_geoState.includes(body.geoState) &&
          t.value.accept_hour.includes(`${hour}`)
        );
      })
      .map((t) => t.value);
    let sortedResults = filteredResult.sort(compare);
    if (sortedResults.length === 0) {
      res.end(JSON.stringify({ decision: "reject" }));
    } else {
      res.end(
        JSON.stringify({ decision: "accept", url: sortedResults[0].url })
      );
    }
  });
}

function compare(a, b) {
  if (a.value < b.value) {
    return 1;
  }
  if (a.value > b.value) {
    return -1;
  }
  return 0;
}
