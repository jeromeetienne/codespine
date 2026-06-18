# Shared per-project profiling workloads for the runners (ADR 0001).
#
# `emit_workload <project>` prints a TypeScript driver to stdout that exercises
# the sample project's real public API under load, so the V8 sampler catches the
# in-project hot frames. Imports are relative to the sample project directory
# (`./src/...`), so the driver must be written INTO sample_projects/<project>/
# (the importing file's location is what those relative paths resolve against).
#
# Sourced by both scripts/profile_and_enrich.sh (native) and
# scripts/profile_and_enrich_docker.sh (containerised) so there is one source of
# truth for the workloads.
emit_workload() {
	case "$1" in
	project_01)
		cat <<'EOF'
import { StringUtils } from './src/utils/string_utils.js';
import { ArrayUtils } from './src/utils/array_utils.js';
const words = 'the quick brown fox jumps over the lazy dog '.repeat(60);
let sink = 0;
for (let i = 0; i < 200000; i += 1) {
	const slug = StringUtils.slugify(words);
	sink += StringUtils.titleCase(words).length;
	sink += ArrayUtils.unique(ArrayUtils.flatten(ArrayUtils.chunk(slug.split('-'), 3))).length;
}
console.log(sink);
EOF
		;;
	project_02)
		cat <<'EOF'
import { Calc } from './src/calc.js';
const expressions = ['1 + 2 * 3', '(1 + 2) * 3', '-4 + 10 / 2', '2 * (3 + 4) - 1', '((1+2)*(3+4))/5 - 6'];
let sink = 0;
for (let i = 0; i < 800000; i += 1) {
	for (const expression of expressions) sink += Calc.evaluate(expression);
}
console.log(sink);
EOF
		;;
	project_03)
		cat <<'EOF'
import { Circle } from './src/shapes/circle.js';
import { Rectangle } from './src/shapes/rectangle.js';
import { Square } from './src/shapes/square.js';
import type { Shape } from './src/shapes/shape.js';
const shapes: Shape[] = [new Circle({ x: 0, y: 0 }, 2), new Rectangle({ x: 0, y: 0 }, 3, 4), new Square({ x: 0, y: 0 }, 5)];
let sink = 0;
for (let i = 0; i < 4000000; i += 1) {
	const shape = shapes[i % 3];
	sink += shape.describe().length + shape.area();
}
console.log(sink);
EOF
		;;
	project_04)
		cat <<'EOF'
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { Database } from './src/db/database.js';
import { Seed } from './src/db/seed.js';
import { ProductsService } from './src/services/products_service.js';
import { SearchService } from './src/services/search_service.js';
import { OrdersService } from './src/services/orders_service.js';
import { StatsService } from './src/services/stats_service.js';

// A FILE-backed database (not :memory:) with the slow defaults so the realism
// track exercises real disk I/O: synchronous=FULL + rollback journal fsync on
// every un-batched order write, and a small page cache forces real page reads.
const dbPath = join(tmpdir(), `project_04_workload_${process.pid}.db`);
const database = new Database({ path: dbPath, journalMode: 'DELETE', synchronous: 'FULL', cacheSizeKib: 2000 });
Seed.run(database, { products: 5000, orders: 8000, maxItemsPerOrder: 5, seed: 0x04040404 });

const terms = ['lamp', 'classic', 'mini', 'desk', 'smart'];
let sink = 0;
for (let i = 0; i < 3000; i += 1) {
	sink += ProductsService.list(database, (i % 20) + 1, 20).items.length;
	sink += ProductsService.getById(database, (i % 5000) + 1)?.stock ?? 0;
	sink += SearchService.search(database, terms[i % terms.length], 10).length;
	if (i % 5 === 0) {
		OrdersService.create(database, { customer: `customer_${i}`, items: [{ productId: (i % 5000) + 1, quantity: 2 }, { productId: ((i * 7) % 5000) + 1, quantity: 1 }] });
	}
	if (i % 50 === 0) {
		sink += StatsService.summary(database).length;
	}
}
database.close();
rmSync(dbPath, { force: true });
console.log(sink);
EOF
		;;
	*)
		echo "no workload defined for $1" >&2
		return 1
		;;
	esac
}
