const express = require("express");
const cors = require("cors");

require("dotenv").config();

const usersRouter = require("./routes/users");
const authRouter = require("./routes/auth");
const propertiesRouter = require("./routes/properties");
const authTest = require("./routes/auth-test");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/users", usersRouter);
app.use("/api/auth", authRouter);
app.use("/api/properties", propertiesRouter);
app.use('/api/auth2', authTest);

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`API running on http://localhost:${port}`);
});
