const { isArray } = Array;

class Resolver {
  constructor(counters = new Map()) {
    this.counters = counters;
  }

  eat(name) {
    const { counters } = this;

    return counters.get(name) || 0;
  }

  resolve(name) {
    const { counters } = this;

    return counters.get(name) || 0;
  }
}

module.exports = { Resolver };
