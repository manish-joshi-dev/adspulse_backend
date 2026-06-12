import helmet from 'helmet';
import cors from 'cors';
import { config } from '../config/env.js';

export const applySecurity = (app) => {
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  }));

  app.use(cors({
    origin: config.nodeEnv === 'production' ? config.clientUrl : '*',
    credentials: true,
  }));
};
