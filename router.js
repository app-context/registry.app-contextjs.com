import cors from 'cors';
import { apiResolver } from 'routers';

export default function(app) {
  const resolve = apiResolver('routes');

  app.use(cors({ origin: true }));

  app.get('/', resolve('registry#index'));

  app.use(resolve.errorHandler);
};
