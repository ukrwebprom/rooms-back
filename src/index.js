const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

require("dotenv").config();
const u = new URL(process.env.DATABASE_URL || '');
const allowedOrigins = [
  'http://localhost:5173',   // твой фронт в dev
  // 'https://your-frontend-domain', // если будет прод
];

const usersRouter = require("./routes/users");
const authRouter = require("./routes/auth");
const propertiesRouter = require("./routes/properties");
const authTest = require("./routes/auth-test");


const app = express();
app.use(cors({
  origin: allowedOrigins,
  credentials: true,                    // <- разрешаем куки/авторизацию
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}));

app.use(express.json());
app.use(cookieParser());
app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/users", usersRouter);
app.use("/api/auth", authRouter);
app.use("/api/properties", propertiesRouter);
app.use('/api/auth2', authTest);

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`API running on http://localhost:${port}`);
});
