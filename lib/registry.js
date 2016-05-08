import got from 'got';
import moment from 'moment';
import githubUrl from 'github-url';
import npmKeyword from 'npm-keyword';
import createNpmStats from 'npm-stats';

import { concurrent, omit } from '@mattinsler/garnish';

const npmStats = createNpmStats();

class Registry {
  constructor(mongodb) {
    this.Package = mongodb.createModel('packages');
    this.Stat = mongodb.createModel('stats');
  }

  @omit('_id')
  list() {
    return this.Package.array();
  }

  async lastUpdated() {
    const stat = await this.Stat.where({_id: 'last-updated'}).first();
    return stat.ts;
  }

  getDownloads(name) {
    var today = moment();
    var yesterday = moment(today).subtract(1, 'day').format('YYYY-MM-DD');
    var lastWeek = moment(today).subtract(1, 'week').format('YYYY-MM-DD');
    var lastMonth = moment(today).subtract(1, 'month').format('YYYY-MM-DD');

    return new Promise((resolve, reject) => {
      npmStats.module(name).downloads({
        since: lastMonth
      }, (err, data) => {
        if (err) { return reject(err); }

        resolve(
          data.reduce((o, d) => {
            o.month += d.value;
            if (d.date >= lastWeek) { o.week += d.value; }
            if (d.date >= yesterday) { o.day += d.value; }
            return o;
          }, { day: 0, week: 0, month: 0 })
        )
      });
    })
  }

  async getVersionData(name) {
    const { body } = await got(`https://registry.npmjs.org/${name}`, { json: true, agent: false });

    var repo = githubUrl(body.repository.url);
    const version = body['dist-tags'].latest;

    async function getStars() {
      const { body } = await got(`https://api.github.com/repos/${repo.user}/${repo.project}`, {
        json: true,
        agent: false
      });
      return body.stargazers_count;
    }
    async function getExample() {
      try {
        const { body } = await got(
          `https://raw.githubusercontent.com/${repo.user}/${repo.project}/master/example.js`,
          { agent: false }
        );
        return body.trim();
      } catch (err) {
        if (err.statusCode === 404) { return }
        throw err;
      }
    }

    const [stars, example] = await Promise.all([
      getStars(),
      getExample()
    ]);

    return {
      version,
      timestamp: new Date(body.time[version]),
      repository: `https://github.com/${repo.user}/${repo.project}`,
      stars,
      example
    };
  }

  async getPackageDetails(name) {
    const [downloads, versionData] = await Promise.all([
      this.getDownloads(name),
      this.getVersionData(name)
    ]);

    return {
      downloads,
      ...versionData
    };
  }

  async refreshPackage(pkg, now) {
    const details = await this.getPackageDetails(pkg.name);

    await this.Package.where({ _id: pkg.name }).update({
      $set: {
        ...details,
        updatedAt: now,
        name: pkg.name,
        description: pkg.description
      }
    }, { upsert: true });
  }

  @concurrent(1)
  async refresh() {
    console.log('Registry: refreshing');

    var now = new Date();

    const packages = (await npmKeyword('app-context'))
      .filter((pkg) => pkg.name.match(/^app-context-/));
    console.log(`Registry: found ${packages.length} packages @ ${now}`);

    await Promise.all(
      packages.map((pkg) => this.refreshPackage(pkg, now))
    );

    console.log('Registry: updated all packages');
    await this.Stat.where({ _id: 'last-updated' }).update({
      $set: { ts: now }
    }, {upsert: true});
  }
}

export default Registry;
