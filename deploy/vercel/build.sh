set -e
rm -rf src_oli dist
git clone --depth 1 -b claude/admiring-cori-ejc2yg https://github.com/vpalacio1998-creator/vpalacio31.git src_oli
cd src_oli
npm install --no-audit --no-fund
OLI_ENV=production node scripts/build.mjs
cp -r dist ../dist
