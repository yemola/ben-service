require("./instrument.js");
const Sentry = require("@sentry/node");
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');

const assetsRoute = require("./routes/assets");
const authRoute = require("./routes/auth");
const clientRoute = require("./routes/client");
const clientDetails = require("./routes/clientDetails");
const dashboardRoute = require("./routes/dashboard");
const dataRecaptureRoute = require("./routes/dataRecapture")
const requestsRoute = require("./routes/requests");
const rolesRoute = require("./routes/roles");
const searchRoute = require("./routes/search");
const tasksRoute = require("./routes/tasks");
const usersRoute = require("./routes/users");
const fileRoute = require('./routes/files');
const operationsRoute = require("./routes/operations");
const hrRoute = require("./routes/hr");
const poolsRoute = require("./routes/pools");
const locationRoute = require('./services/location');
const registrationRoute = require('./services/registration');
const schedulesRoute = require("./routes/schedules");
const acctVerifyRoute = require("./routes/acctVerify");
const { startAnnuityContributionWorker } = require("./workers/annuityContributionWorker");

const app = express();

const corsOptions = {
    origin: '*',
    exposedHeaders: ['Content-Disposition']
}


app.use(helmet());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '/benefit-client')));
app.use(cors(corsOptions));

app.use("/api/assets", assetsRoute);
app.use("/api/auth", authRoute);
app.use("/api/client", clientRoute);
app.use("/api/client-info", clientDetails);
app.use("/api/dashboard", dashboardRoute);
app.use("/api/datarecapture", dataRecaptureRoute);
app.use("/api/requests", requestsRoute);
app.use("/api/roles", rolesRoute);
app.use("/api/search", searchRoute);
app.use("/api/tasks", tasksRoute);
app.use('/api/users', usersRoute);
app.use('/api/files', fileRoute);
app.use('/api/operations', operationsRoute);
app.use('/api/hr', hrRoute);
app.use('/api/pools', poolsRoute);
app.use('/api/schedules', schedulesRoute);
app.use('/api/acct-verify', acctVerifyRoute);

const port = 1601;

app.use((req, res) => {
    res.status(404);
    res.send(`<h3>Error 404: Resource not found.</h3>`);
});

app.get("/", function rootHandler(req, res) {
    res.end("Hello world!");
});

app.get("/debug-sentry", function mainHandler(req, res) {
    throw new Error("My first Sentry error!");
});

// The error handler must be registered before any other error middleware and after all controllers
Sentry.setupExpressErrorHandler(app);

// Optional fallthrough error handler
app.use(function onError(err, req, res, next) {
    // The error id is attached to `res.sentry` to be returned
    // and optionally displayed to the user for support.
    res.statusCode = 500;
    res.end(res.sentry + "\n");
});

app.listen(port, () => {
    console.log(`server running on port ${port}`);
    startAnnuityContributionWorker();
});