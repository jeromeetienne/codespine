## Questions Eric would like to be answered
he got an actual service that is running in production and he would like to know if it can be optimised and 
how much it can be optimised. He also wants to know if the optimisations are worth it or not. 
He want to know if the current servers are enougth and up to how many customers he can handle with it.

- how many customer dash menu server can accept
- SQL Load
  - estimation load
  - potential bottlenecks
- ts_knowledge_graph by claude
  - detection of optimisation
  - creation of gh issue describing it
  - eric to actually do the cut/paste
- audit maintenability
  - usage fallow
- audit security
- mesure latence
- intrumentisation of the target codebase is sufficient
  - if not, create gh issue describing it
- https://dash-suite.com/
- https://www.vectron-systems.com/en/

---

## How to test that locally before going in production ?
- create a fake server which simulate the behaviour of the real one, and test the optimisations on it.
