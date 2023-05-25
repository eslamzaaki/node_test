var { SchemaFieldTypes } = require("redis");
var redis = require("./redis");

async function intializeTargetSchema() {
  try {
    await redis.ft.create(
      "idx:targets",
      {
        "$.target_id": {
          type: SchemaFieldTypes.NUMERIC,
          AS: "target_id",
        },
        "$.url": {
          type: SchemaFieldTypes.TEXT,
          sortable: true,
        },
        "$.maxAcceptsPerDay": {
          type: SchemaFieldTypes.NUMERIC,
          AS: "maxAcceptsPerDay",
        },
        "$.value": {
          type: SchemaFieldTypes.NUMERIC,
          AS: "value",
        },
        "$.accept_geoState": {
          type: SchemaFieldTypes.TAG,
          AS: "accept_geoState",
        },
        "$.accept_hour": {
          type: SchemaFieldTypes.TAG,
          AS: "accept_hour",
        },
      },
      {
        ON: "JSON",
        PREFIX: "target:",
      }
    );
  } catch (e) {
    if (e.message === "Index already exists") {
      console.log("Index exists already, skipped creation.");
    } else {
      // Something went wrong, perhaps RediSearch isn't installed...
      console.error(e);
      process.exit(1);
    }
  }
}

async function creatTarget(req, res) {
  let body = "";
  req.on("data", (chunk) => {
    body += chunk.toString();
  });
  req.on("end", async () => {
    body = JSON.parse(body);
    let id = parseInt(Math.random() * 1000000);
    let response = await redis.json.set(`target:${id}`, "$", {
      target_id: id,
      url: body.url,
      value: parseInt(body.value),
      maxAcceptsPerDay: parseInt(body.maxAcceptsPerDay),
      accept_geoState: body["accept"]["geoState"]["$in"],
      accept_hour: body["accept"]["hour"]["$in"],
    });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: response }));
  });
}
async function getTargets(req, res) {
  let result = await redis.ft.search("idx:targets", "*");
  res.end(JSON.stringify(result));
}
async function getTargetById(req, res) {
  let id = parseInt(req.url.split("/")[2]);
  console.log(id);
  let result = await redis.json.get(`target:${id}`);
  res.end(JSON.stringify(result));
}
async function updateTargetById(req, res) {
  let id = parseInt(req.url.split("/")[2]);
  let body = "";
  req.on("data", (chunk) => {
    body += chunk.toString();
  });
  req.on("end", async () => {
    body = JSON.parse(body);
    let response = await redis.json.set(`target:${id}`, "$", {
      target_id: id,
      url: body.url,
      value: parseInt(body.value),
      maxAcceptsPerDay: parseInt(body.maxAcceptsPerDay),
      accept_geoState: body["accept"]["geoState"]["$in"],
      accept_hour: body["accept"]["hour"]["$in"],
    });
    let result = await redis.json.get(`target:${id}`);
    res.end(JSON.stringify(result));
  });
}

module.exports = {
  creatTarget,
  getTargets,
  getTargetById,
  updateTargetById,
  intializeTargetSchema,
};
