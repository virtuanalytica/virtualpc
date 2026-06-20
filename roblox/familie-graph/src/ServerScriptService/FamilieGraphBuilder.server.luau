--!strict
-- Familie-kennisgraaf renderer voor Roblox (werkt ook in Roblox-VR op de Quest).
-- Bouwt de graaf uit ReplicatedStorage.FamilieGraphData (ingebakken snapshot,
-- gegenereerd door scripts/export-family-roblox.py) op in 3D: knopen als neon-
-- bollen met naamlabels, randen als dunne neon-staven, geclusterd per categorie.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local data = require(ReplicatedStorage:WaitForChild("FamilieGraphData"))

-- Categorie-groep → kleur (matcht de web-viewer GROUP_COLORS).
local GROUP_COLOR: { [number]: Color3 } = {
	[1] = Color3.fromHex("ff8fab"), [2] = Color3.fromHex("5b8cff"), [3] = Color3.fromHex("ffd166"),
	[4] = Color3.fromHex("06d6a0"), [5] = Color3.fromHex("9b8cff"), [6] = Color3.fromHex("ff9f5b"),
	[7] = Color3.fromHex("4dd2ff"), [8] = Color3.fromHex("c0e34d"), [9] = Color3.fromHex("ff6b9d"),
	[10] = Color3.fromHex("7ee787"), [11] = Color3.fromHex("36c5f0"), [12] = Color3.fromHex("f5a623"),
	[13] = Color3.fromHex("b07cff"), [14] = Color3.fromHex("8899aa"), [0] = Color3.fromHex("cfd8e3"),
}

local R = 70          -- straal van de categorie-ring
local CLUSTER = 26    -- spreiding binnen een categorie-cluster

local root = Instance.new("Folder")
root.Name = "FamilieGraph"
root.Parent = workspace

local nodeFolder = Instance.new("Folder"); nodeFolder.Name = "Nodes"; nodeFolder.Parent = root
local edgeFolder = Instance.new("Folder"); edgeFolder.Name = "Edges"; edgeFolder.Parent = root

-- Deterministische pseudo-random offset zodat de layout stabiel is.
local function jitter(idx: number, salt: number): number
	return ((idx * salt) % 1000) / 1000 - 0.5
end

-- Cluster per categorie-groep op een ring; knopen er deterministisch omheen.
local function nodePosition(group: number, idx: number): Vector3
	local ga = ((group % 15) / 15) * math.pi * 2
	local cx, cz = math.cos(ga) * R, math.sin(ga) * R
	local cy = ((group % 5) - 2) * 20
	return Vector3.new(
		cx + jitter(idx, 2654435761) * CLUSTER,
		cy + jitter(idx, 40503) * CLUSTER,
		cz + jitter(idx, 12289) * CLUSTER
	)
end

local posByName: { [string]: Vector3 } = {}

-- Knopen.
for idx, node in ipairs(data.nodes) do
	local group = node.group or 0
	local pos = nodePosition(group, idx)
	posByName[node.id] = pos

	local kind = node.kind or "entity"
	local size = kind == "graph-root" and 7 or kind == "category" and 4.5 or kind == "chat" and 1.6 or 2.4

	local ball = Instance.new("Part")
	ball.Name = node.name
	ball.Shape = Enum.PartType.Ball
	ball.Anchored = true
	ball.CanCollide = false
	ball.Material = Enum.Material.Neon
	ball.Color = GROUP_COLOR[group] or GROUP_COLOR[0]
	ball.Size = Vector3.new(size, size, size)
	ball.Position = pos
	ball.Parent = nodeFolder

	-- Naamlabel (chats kort houden — die zijn talrijk).
	if kind ~= "chat" then
		local bb = Instance.new("BillboardGui")
		bb.Size = UDim2.fromScale(0.2 * #node.name + 1, 1)
		bb.StudsOffsetWorldSpace = Vector3.new(0, size, 0)
		bb.AlwaysOnTop = true
		bb.MaxDistance = 220
		bb.Parent = ball
		local lbl = Instance.new("TextLabel")
		lbl.Size = UDim2.fromScale(1, 1)
		lbl.BackgroundTransparency = 1
		lbl.TextColor3 = Color3.fromHex("e6edf3")
		lbl.TextStrokeTransparency = 0.4
		lbl.TextScaled = true
		lbl.Font = Enum.Font.GothamMedium
		lbl.Text = node.name
		lbl.Parent = bb
	end
end

-- Randen (dunne neon-staven). Afgeleide randen vager dan gestelde.
local function drawLink(a: Vector3, b: Vector3, inferred: boolean)
	local delta = b - a
	local mag = delta.Magnitude
	if mag < 0.1 then return end
	local part = Instance.new("Part")
	part.Anchored = true
	part.CanCollide = false
	part.Material = Enum.Material.Neon
	part.Color = inferred and Color3.fromHex("4a5570") or Color3.fromHex("6e8cd8")
	part.Transparency = inferred and 0.55 or 0.3
	part.Size = Vector3.new(0.12, 0.12, mag)
	part.CFrame = CFrame.lookAt((a + b) / 2, b)
	part.Parent = edgeFolder
end

local drawn = 0
for _, link in ipairs(data.links) do
	local a, b = posByName[link.source], posByName[link.target]
	if a and b then
		drawLink(a, b, link.inferred == true)
		drawn += 1
	end
end

print(("[FamilieGraph] %d knopen, %d randen opgebouwd"):format(#data.nodes, drawn))
