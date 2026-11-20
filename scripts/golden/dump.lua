-- LuaJIT: načte reálný mapgen.lua + biomes.lua se stubem minetest.*
-- a vypíše island_for_cell pro 3 seedy × buňky −8…8 jako JSON.
-- Použití: luajit scripts/golden/dump.lua <DoggioWars>/mods/dw_core > test/golden/islands.json

local dir = arg[1] or error("usage: dump.lua <path to mods/dw_core>")
local seed_setting = "42"

minetest = {
  get_content_id = function() return 0 end,
  registered_nodes = {},
  CONTENT_IGNORE = 127,
  after = function() end,
  register_on_generated = function() end,
  register_on_mapgen_init = function() end,
  get_mapgen_setting = function() return seed_setting end,
  get_modpath = function() return dir end,
  log = function() end,
}
core = minetest
dofile(dir .. "/biomes.lua")
dofile(dir .. "/mapgen.lua")

local function num(v)
  if v == math.floor(v) and math.abs(v) < 2^53 then return string.format("%d", v) end
  return string.format("%.17g", v)
end

local seeds = { "42", "123456789", "18446744073709551615" }
local out = {}
for _, s in ipairs(seeds) do
  local seed = 0
  for d in s:gmatch("%d") do seed = (seed * 10 + tonumber(d)) % 2147483648 end
  if seed == 0 then seed = 42 end
  local cells = {}
  for cx = -8, 8 do
    for cz = -8, 8 do
      local isl = doggiowars.island_for_cell(cx, cz, seed)
      if isl then
        cells[#cells + 1] = string.format(
          '{"cx":%d,"cz":%d,"x":%s,"y":%s,"z":%s,"radius":%s,"biome":%d,"shape":"%s","hs":%s,"cap":%s,"tail":%s,"tunnels":%s,"p10":%s,"pm10":%s}',
          cx, cz, num(isl.x), num(isl.y), num(isl.z), num(isl.radius), isl.biome_idx, isl.shape,
          num(isl.height_scale), num(isl.cap_frac), num(isl.tail_frac), tostring(isl.tunnels),
          num(doggiowars.island_profile(isl, 10)), num(doggiowars.island_profile(isl, -10)))
      else
        cells[#cells + 1] = string.format('{"cx":%d,"cz":%d,"empty":true}', cx, cz)
      end
    end
  end
  out[#out + 1] = string.format('{"seedString":"%s","seed":%s,"cells":[%s]}', s, num(seed), table.concat(cells, ","))
end
io.write("[" .. table.concat(out, ",\n") .. "]\n")
