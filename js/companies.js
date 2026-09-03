// Real listed companies used as the game's stock universe.
//
// Format per line: TICKER|Company name|starting price (USD)|market cap ($B)
//
// The prices and caps are ROUGH, ROUNDED figures from a 2025-era snapshot, used
// only as a starting point for the simulation. Every price you see in the game
// after tick zero is procedurally simulated and has nothing to do with the real
// market. This is a game, not market data, and nothing here is financial advice.

export const SECTOR_ROWS = {

tech: `
AAPL|Apple|230|3500
MSFT|Microsoft|420|3120
NVDA|NVIDIA|135|3300
AVGO|Broadcom|175|815
ORCL|Oracle|165|460
CRM|Salesforce|280|270
AMD|Advanced Micro Devices|150|240
ADBE|Adobe|500|220
ACN|Accenture|340|215
CSCO|Cisco Systems|55|220
TXN|Texas Instruments|200|185
QCOM|Qualcomm|165|185
INTU|Intuit|620|175
IBM|IBM|215|200
NOW|ServiceNow|900|185
AMAT|Applied Materials|180|150
MU|Micron Technology|100|110
ADI|Analog Devices|225|110
LRCX|Lam Research|75|95
PANW|Palo Alto Networks|360|118
KLAC|KLA Corporation|700|94
SNPS|Synopsys|500|77
CDNS|Cadence Design Systems|280|76
CRWD|CrowdStrike|300|73
INTC|Intel|22|95
MSI|Motorola Solutions|450|75
ANET|Arista Networks|350|110
APH|Amphenol|68|82
ADSK|Autodesk|280|60
ROP|Roper Technologies|540|58
FTNT|Fortinet|85|65
NXPI|NXP Semiconductors|230|58
DELL|Dell Technologies|120|85
HPQ|HP Inc.|35|34
HPE|Hewlett Packard Enterprise|20|26
WDAY|Workday|240|64
TEAM|Atlassian|200|52
DDOG|Datadog|120|41
SNOW|Snowflake|150|50
ZS|Zscaler|190|29
NET|Cloudflare|95|32
MDB|MongoDB|280|21
HUBS|HubSpot|540|27
TTD|The Trade Desk|100|49
PLTR|Palantir Technologies|40|90
SMCI|Super Micro Computer|40|24
ON|ON Semiconductor|70|30
MCHP|Microchip Technology|75|40
SWKS|Skyworks Solutions|90|14
QRVO|Qorvo|90|9
TER|Teradyne|130|21
ENTG|Entegris|110|17
GLW|Corning|45|39
STX|Seagate Technology|100|21
WDC|Western Digital|65|22
NTAP|NetApp|120|24
KEYS|Keysight Technologies|155|27
ZBRA|Zebra Technologies|350|18
TYL|Tyler Technologies|600|25
PTC|PTC|180|21
ANSS|Ansys|330|29
FICO|Fair Isaac|1900|47
IT|Gartner|480|37
CTSH|Cognizant Technology|75|38
INFY|Infosys|20|85
WIT|Wipro|6|30
TSM|Taiwan Semiconductor|180|930
ASML|ASML Holding|750|300
SAP|SAP|230|280
SONY|Sony Group|90|110
STM|STMicroelectronics|30|27
ARM|Arm Holdings|140|145
GFS|GlobalFoundries|45|25
AKAM|Akamai Technologies|95|14
GEN|Gen Digital|28|18
JNPR|Juniper Networks|37|12
CIEN|Ciena|65|9
PSTG|Pure Storage|55|18
NTNX|Nutanix|65|17
OKTA|Okta|90|15
TWLO|Twilio|90|14
DOCU|DocuSign|85|17
ZM|Zoom Communications|85|26
S|SentinelOne|22|7
ESTC|Elastic|95|9
GTLB|GitLab|55|9
CFLT|Confluent|25|8
U|Unity Software|22|9
APP|AppLovin|300|100
DBX|Dropbox|28|9
BOX|Box|32|5
VRSN|Verisign|190|19
EPAM|EPAM Systems|200|11
JBL|Jabil|140|16
FLEX|Flex|35|14
TDY|Teledyne Technologies|450|21
TRMB|Trimble|65|16
CDW|CDW|220|30
SHOP|Shopify|75|97
UMC|United Microelectronics|8|20
ERIC|Ericsson|8|27
NOK|Nokia|4|24
`,

comm: `
GOOGL|Alphabet|170|2100
META|Meta Platforms|560|1420
NFLX|Netflix|700|300
DIS|Walt Disney|95|175
CMCSA|Comcast|42|165
T|AT&T|22|155
VZ|Verizon Communications|42|175
TMUS|T-Mobile US|220|255
CHTR|Charter Communications|350|50
WBD|Warner Bros. Discovery|8|20
PARA|Paramount Global|11|8
FOXA|Fox Corporation|42|19
NWSA|News Corp|28|16
EA|Electronic Arts|145|38
TTWO|Take-Two Interactive|160|28
RBLX|Roblox|45|29
SPOT|Spotify Technology|400|80
PINS|Pinterest|32|22
SNAP|Snap|11|18
MTCH|Match Group|35|9
LYV|Live Nation Entertainment|110|25
OMC|Omnicom Group|100|20
IPG|Interpublic Group|30|11
NYT|New York Times|55|9
WMG|Warner Music Group|32|17
BIDU|Baidu|90|31
NTES|NetEase|95|60
SE|Sea Limited|95|55
Z|Zillow Group|65|15
VOD|Vodafone Group|9|24
`,

cons: `
AMZN|Amazon.com|185|1930
TSLA|Tesla|250|800
HD|Home Depot|380|375
MCD|McDonald's|290|210
BKNG|Booking Holdings|4000|135
LOW|Lowe's Companies|250|145
TJX|TJX Companies|115|130
SBUX|Starbucks|95|108
NKE|Nike|78|118
CMG|Chipotle Mexican Grill|55|75
ORLY|O'Reilly Automotive|1150|67
AZO|AutoZone|3100|53
ROST|Ross Stores|150|50
MAR|Marriott International|250|71
HLT|Hilton Worldwide|230|56
GM|General Motors|48|54
F|Ford Motor|11|43
RIVN|Rivian Automotive|12|12
LCID|Lucid Group|3|7
LVS|Las Vegas Sands|45|33
MGM|MGM Resorts International|40|12
WYNN|Wynn Resorts|85|10
CZR|Caesars Entertainment|38|8
DKNG|DraftKings|38|18
RCL|Royal Caribbean|170|44
CCL|Carnival|18|22
NCLH|Norwegian Cruise Line|20|9
DHI|D.R. Horton|170|55
LEN|Lennar|170|45
PHM|PulteGroup|130|27
NVR|NVR|8000|24
TOL|Toll Brothers|130|13
YUM|Yum! Brands|135|38
DRI|Darden Restaurants|165|20
DPZ|Domino's Pizza|420|15
QSR|Restaurant Brands International|70|32
WEN|Wendy's|17|4
EBAY|eBay|60|30
ETSY|Etsy|55|6
W|Wayfair|50|6
CHWY|Chewy|30|13
DASH|DoorDash|140|58
ABNB|Airbnb|130|82
EXPE|Expedia Group|140|18
LULU|Lululemon Athletica|280|35
DECK|Deckers Outdoor|150|23
SKX|Skechers|65|10
VFC|VF Corporation|18|7
RL|Ralph Lauren|180|11
PVH|PVH Corp|100|6
GPS|Gap|22|8
ANF|Abercrombie & Fitch|140|7
URBN|Urban Outfitters|40|4
BBY|Best Buy|90|19
DG|Dollar General|85|19
DLTR|Dollar Tree|70|15
KMX|CarMax|75|12
AN|AutoNation|170|7
LAD|Lithia Motors|300|8
GRMN|Garmin|200|39
POOL|Pool Corporation|350|13
WSM|Williams-Sonoma|130|16
TSCO|Tractor Supply|55|29
BURL|Burlington Stores|250|16
FIVE|Five Below|90|5
APTV|Aptiv|65|15
BWA|BorgWarner|35|8
LKQ|LKQ Corporation|40|10
GT|Goodyear Tire & Rubber|9|3
HOG|Harley-Davidson|30|4
THO|Thor Industries|100|5
BC|Brunswick|75|5
HAS|Hasbro|65|9
MAT|Mattel|19|6
BABA|Alibaba Group|85|205
JD|JD.com|30|45
PDD|PDD Holdings|130|180
MELI|MercadoLibre|1800|91
CPNG|Coupang|24|43
NIO|NIO|5|10
XPEV|XPeng|12|11
LI|Li Auto|22|23
TM|Toyota Motor|180|240
HMC|Honda Motor|30|48
STLA|Stellantis|13|40
RACE|Ferrari|420|76
TCOM|Trip.com Group|55|36
GRAB|Grab Holdings|4|16
`,

stap: `
WMT|Walmart|80|645
COST|Costco Wholesale|880|390
PG|Procter & Gamble|165|390
KO|Coca-Cola|68|295
PEP|PepsiCo|170|235
PM|Philip Morris International|120|187
MO|Altria Group|52|88
MDLZ|Mondelez International|68|92
CL|Colgate-Palmolive|95|78
KMB|Kimberly-Clark|140|47
GIS|General Mills|68|38
K|Kellanova|60|20
KHC|Kraft Heinz|33|40
HSY|Hershey|190|38
SYY|Sysco|75|37
KR|Kroger|58|42
ADM|Archer-Daniels-Midland|60|30
BG|Bunge Global|95|13
TSN|Tyson Foods|60|21
HRL|Hormel Foods|31|17
CAG|Conagra Brands|30|14
CPB|Campbell's|45|13
SJM|J.M. Smucker|115|12
MKC|McCormick|80|21
STZ|Constellation Brands|240|44
BF.B|Brown-Forman|45|21
TAP|Molson Coors|55|11
KDP|Keurig Dr Pepper|35|48
MNST|Monster Beverage|50|49
CELH|Celsius Holdings|35|8
CHD|Church & Dwight|105|26
CLX|Clorox|155|19
EL|Estee Lauder|90|32
COTY|Coty|9|8
USFD|US Foods|55|13
UL|Unilever|60|150
DEO|Diageo|120|70
BUD|Anheuser-Busch InBev|60|120
BTI|British American Tobacco|35|78
`,

enrg: `
XOM|Exxon Mobil|115|500
CVX|Chevron|150|275
COP|ConocoPhillips|105|125
EOG|EOG Resources|125|72
SLB|SLB|43|61
PSX|Phillips 66|130|55
MPC|Marathon Petroleum|160|55
VLO|Valero Energy|135|43
OXY|Occidental Petroleum|50|46
WMB|Williams Companies|45|55
KMI|Kinder Morgan|22|49
OKE|ONEOK|85|50
HES|Hess|140|43
DVN|Devon Energy|40|25
FANG|Diamondback Energy|180|52
HAL|Halliburton|30|26
BKR|Baker Hughes|38|38
TRGP|Targa Resources|150|33
LNG|Cheniere Energy|180|41
EQT|EQT Corporation|38|22
CTRA|Coterra Energy|25|19
APA|APA Corporation|25|9
PBR|Petrobras|14|90
SHEL|Shell|68|210
BP|BP|33|90
TTE|TotalEnergies|62|150
E|Eni|30|50
SU|Suncor Energy|38|48
CNQ|Canadian Natural Resources|35|75
ENB|Enbridge|40|85
FSLR|First Solar|200|21
ENPH|Enphase Energy|75|10
RUN|Sunrun|10|2
`,

fin: `
BRK.B|Berkshire Hathaway|440|960
JPM|JPMorgan Chase|215|615
V|Visa|280|540
MA|Mastercard|480|445
BAC|Bank of America|40|310
WFC|Wells Fargo|58|200
GS|Goldman Sachs|500|165
MS|Morgan Stanley|105|170
SPGI|S&P Global|500|155
AXP|American Express|250|180
BLK|BlackRock|900|135
SCHW|Charles Schwab|70|128
C|Citigroup|63|120
PGR|Progressive|250|145
CB|Chubb|280|113
MMC|Marsh & McLennan|215|106
BX|Blackstone|150|185
KKR|KKR|130|115
APO|Apollo Global Management|130|75
ICE|Intercontinental Exchange|160|92
CME|CME Group|215|77
MCO|Moody's|470|86
AON|Aon|350|76
AJG|Arthur J. Gallagher|280|61
PNC|PNC Financial Services|180|72
USB|U.S. Bancorp|45|70
TFC|Truist Financial|43|57
COF|Capital One Financial|150|57
BK|Bank of New York Mellon|72|53
STT|State Street|85|25
NTRS|Northern Trust|95|19
FITB|Fifth Third Bancorp|43|29
KEY|KeyCorp|17|16
RF|Regions Financial|23|21
CFG|Citizens Financial Group|42|19
HBAN|Huntington Bancshares|15|21
MTB|M&T Bank|170|28
ZION|Zions Bancorporation|48|7
CMA|Comerica|55|7
ALLY|Ally Financial|36|11
DFS|Discover Financial Services|140|35
SYF|Synchrony Financial|50|20
AIG|American International Group|75|48
MET|MetLife|75|53
PRU|Prudential Financial|120|43
AFL|Aflac|105|59
ALL|Allstate|190|50
TRV|Travelers|240|55
HIG|Hartford|115|34
CINF|Cincinnati Financial|145|23
WRB|W. R. Berkley|58|22
L|Loews|80|18
GL|Globe Life|105|9
AIZ|Assurant|190|10
PFG|Principal Financial Group|85|20
AMP|Ameriprise Financial|470|46
TROW|T. Rowe Price|115|26
BEN|Franklin Resources|22|11
IVZ|Invesco|17|8
FI|Fiserv|170|97
FIS|FIS|85|46
GPN|Global Payments|105|26
PYPL|PayPal Holdings|70|72
XYZ|Block|70|43
COIN|Coinbase Global|200|49
HOOD|Robinhood Markets|22|19
SOFI|SoFi Technologies|8|8
NDAQ|Nasdaq|72|41
CBOE|Cboe Global Markets|200|21
MKTX|MarketAxess|230|9
MSCI|MSCI|560|44
FDS|FactSet Research Systems|450|17
JEF|Jefferies Financial Group|60|13
RJF|Raymond James Financial|120|25
LPLA|LPL Financial|230|17
EG|Everest Group|380|16
RNR|RenaissanceRe|250|13
ACGL|Arch Capital Group|100|38
BRO|Brown & Brown|105|30
HDB|HDFC Bank|63|155
IBN|ICICI Bank|30|105
MUFG|Mitsubishi UFJ Financial|11|130
RY|Royal Bank of Canada|120|170
TD|Toronto-Dominion Bank|60|105
BNS|Bank of Nova Scotia|50|60
BN|Brookfield Corporation|55|90
BAM|Brookfield Asset Management|50|82
`,

hlth: `
LLY|Eli Lilly|900|855
UNH|UnitedHealth Group|560|515
JNJ|Johnson & Johnson|160|385
ABBV|AbbVie|195|345
MRK|Merck|105|265
TMO|Thermo Fisher Scientific|600|230
ABT|Abbott Laboratories|115|200
DHR|Danaher|250|185
AMGN|Amgen|320|172
PFE|Pfizer|28|160
ISRG|Intuitive Surgical|480|172
BSX|Boston Scientific|85|125
SYK|Stryker|360|137
MDT|Medtronic|85|110
VRTX|Vertex Pharmaceuticals|470|121
REGN|Regeneron Pharmaceuticals|1000|110
GILD|Gilead Sciences|85|106
BMY|Bristol-Myers Squibb|50|101
CI|Cigna Group|340|95
ELV|Elevance Health|450|105
CVS|CVS Health|60|75
HCA|HCA Healthcare|380|98
MCK|McKesson|600|77
COR|Cencora|240|47
CAH|Cardinal Health|110|27
ZTS|Zoetis|180|82
BDX|Becton Dickinson|235|68
EW|Edwards Lifesciences|70|41
DXCM|DexCom|70|27
IDXX|IDEXX Laboratories|450|37
A|Agilent Technologies|140|40
MTD|Mettler-Toledo|1400|30
WAT|Waters|350|21
IQV|IQVIA Holdings|210|38
CRL|Charles River Laboratories|200|10
RMD|ResMed|230|34
BAX|Baxter International|35|18
ZBH|Zimmer Biomet|105|21
HOLX|Hologic|78|18
STE|Steris|230|23
COO|Cooper Companies|95|19
PODD|Insulet|230|16
ALGN|Align Technology|200|15
MRNA|Moderna|60|23
BNTX|BioNTech|105|25
BIIB|Biogen|200|29
INCY|Incyte|65|13
EXAS|Exact Sciences|55|10
NBIX|Neurocrine Biosciences|120|12
UTHR|United Therapeutics|340|16
ALNY|Alnylam Pharmaceuticals|250|32
SRPT|Sarepta Therapeutics|130|12
IONS|Ionis Pharmaceuticals|40|6
JAZZ|Jazz Pharmaceuticals|110|7
VTRS|Viatris|11|13
OGN|Organon|18|5
PRGO|Perrigo|25|3
TEVA|Teva Pharmaceutical|17|19
NVO|Novo Nordisk|110|490
AZN|AstraZeneca|78|240
NVS|Novartis|110|235
SNY|Sanofi|52|130
GSK|GSK|40|82
HUM|Humana|300|36
CNC|Centene|65|34
MOH|Molina Healthcare|330|19
UHS|Universal Health Services|220|14
THC|Tenet Healthcare|150|14
DVA|DaVita|150|13
LH|Labcorp Holdings|230|19
DGX|Quest Diagnostics|150|17
VEEV|Veeva Systems|210|34
`,

ind: `
GE|GE Aerospace|180|195
CAT|Caterpillar|350|170
RTX|RTX Corporation|120|160
HON|Honeywell International|205|133
UNP|Union Pacific|240|145
BA|Boeing|180|110
LMT|Lockheed Martin|550|130
DE|Deere & Company|400|110
ADP|Automatic Data Processing|270|110
UPS|United Parcel Service|130|110
ETN|Eaton|300|120
ITW|Illinois Tool Works|250|75
NOC|Northrop Grumman|490|72
GD|General Dynamics|290|79
EMR|Emerson Electric|105|60
PH|Parker Hannifin|600|77
CSX|CSX|33|64
NSC|Norfolk Southern|250|56
PCAR|PACCAR|100|52
CMI|Cummins|320|44
JCI|Johnson Controls|75|50
CARR|Carrier Global|72|65
TT|Trane Technologies|380|85
LHX|L3Harris Technologies|235|45
TDG|TransDigm Group|1300|73
HWM|Howmet Aerospace|100|41
AXON|Axon Enterprise|400|30
URI|United Rentals|780|51
FAST|Fastenal|70|40
GWW|W.W. Grainger|1000|49
PWR|Quanta Services|300|44
EME|EMCOR Group|400|18
MAS|Masco|75|17
AOS|A.O. Smith|80|12
DOV|Dover|190|26
ROK|Rockwell Automation|270|31
XYL|Xylem|130|32
IEX|IDEX Corporation|210|16
PNR|Pentair|95|16
SWK|Stanley Black & Decker|95|15
TXT|Textron|85|16
HII|Huntington Ingalls Industries|250|10
LDOS|Leidos Holdings|160|21
BAH|Booz Allen Hamilton|150|19
CACI|CACI International|500|11
SAIC|SAIC|130|6
WM|Waste Management|210|84
RSG|Republic Services|200|63
WCN|Waste Connections|180|46
VRSK|Verisk Analytics|270|38
CTAS|Cintas|200|80
PAYX|Paychex|130|47
ROL|Rollins|48|23
FDX|FedEx|280|68
ODFL|Old Dominion Freight Line|200|43
JBHT|J.B. Hunt Transport|170|17
CHRW|C.H. Robinson Worldwide|100|12
EXPD|Expeditors International|125|17
UBER|Uber Technologies|70|145
LYFT|Lyft|13|5
DAL|Delta Air Lines|50|32
UAL|United Airlines Holdings|60|20
AAL|American Airlines Group|13|8
LUV|Southwest Airlines|30|18
ALK|Alaska Air Group|45|6
MMM|3M|130|72
GEV|GE Vernova|250|68
VLTO|Veralto|105|26
OTIS|Otis Worldwide|95|38
IR|Ingersoll Rand|90|36
FTV|Fortive|75|26
AME|AMETEK|170|39
BLDR|Builders FirstSource|150|18
NDSN|Nordson|230|13
SNA|Snap-on|300|16
GGG|Graco|85|14
CP|Canadian Pacific Kansas City|80|75
CNI|Canadian National Railway|105|66
`,

mat: `
LIN|Linde|470|225
SHW|Sherwin-Williams|370|93
APD|Air Products and Chemicals|300|66
ECL|Ecolab|250|71
FCX|Freeport-McMoRan|45|65
NEM|Newmont|48|55
NUE|Nucor|150|35
STLD|Steel Dynamics|130|20
CLF|Cleveland-Cliffs|13|6
X|United States Steel|38|8
DOW|Dow|50|35
LYB|LyondellBasell|95|31
DD|DuPont de Nemours|85|35
PPG|PPG Industries|125|29
IFF|International Flavors & Fragrances|100|25
ALB|Albemarle|90|11
CE|Celanese|110|12
EMN|Eastman Chemical|100|12
MOS|Mosaic|27|9
CF|CF Industries|80|14
CTVA|Corteva|55|38
VMC|Vulcan Materials|250|33
MLM|Martin Marietta Materials|540|33
PKG|Packaging Corporation of America|200|18
IP|International Paper|45|16
AMCR|Amcor|10|15
SEE|Sealed Air|35|5
BALL|Ball Corporation|60|18
RS|Reliance|280|16
SCCO|Southern Copper|110|85
GOLD|Barrick Mining|18|32
AEM|Agnico Eagle Mines|80|40
RIO|Rio Tinto|65|110
BHP|BHP Group|55|140
VALE|Vale|11|48
`,

reit: `
PLD|Prologis|120|110
AMT|American Tower|205|95
EQIX|Equinix|850|80
WELL|Welltower|130|78
SPG|Simon Property Group|165|54
PSA|Public Storage|340|60
O|Realty Income|60|52
CCI|Crown Castle|105|46
DLR|Digital Realty Trust|160|53
VICI|VICI Properties|32|33
EXR|Extra Space Storage|165|35
AVB|AvalonBay Communities|220|31
EQR|Equity Residential|72|27
MAA|Mid-America Apartment|150|18
INVH|Invitation Homes|35|21
ESS|Essex Property Trust|300|19
ARE|Alexandria Real Estate|110|19
BXP|BXP|75|12
VTR|Ventas|60|25
IRM|Iron Mountain|110|32
WY|Weyerhaeuser|30|22
HST|Host Hotels & Resorts|17|12
KIM|Kimco Realty|22|15
REG|Regency Centers|70|13
FRT|Federal Realty|110|9
CPT|Camden Property Trust|120|13
UDR|UDR|42|14
SBAC|SBA Communications|230|25
CBRE|CBRE Group|110|34
`,

util: `
NEE|NextEra Energy|75|155
SO|Southern Company|88|96
DUK|Duke Energy|115|89
CEG|Constellation Energy|230|72
AEP|American Electric Power|100|53
SRE|Sempra|80|51
D|Dominion Energy|55|46
PCG|PG&E|20|43
EXC|Exelon|39|39
XEL|Xcel Energy|62|35
ED|Consolidated Edison|100|35
WEC|WEC Energy Group|95|30
PEG|Public Service Enterprise|85|42
ES|Eversource Energy|65|23
DTE|DTE Energy|125|26
AEE|Ameren|85|23
FE|FirstEnergy|42|24
PPL|PPL Corporation|32|24
CMS|CMS Energy|68|20
CNP|CenterPoint Energy|28|18
NI|NiSource|33|15
LNT|Alliant Energy|58|15
EVRG|Evergy|60|14
AES|AES Corporation|18|13
ATO|Atmos Energy|130|20
NRG|NRG Energy|85|18
VST|Vistra|120|41
PNW|Pinnacle West Capital|85|10
OGE|OGE Energy|40|8
AWK|American Water Works|140|27
WTRG|Essential Utilities|38|10
`,
};

// Index funds priced as baskets of their constituents (see market.js).
export const FUNDS = [
  { ticker: 'SPY',  name: 'Broad 500 Index Fund',        price: 560, sectors: null,   members: 40 },
  { ticker: 'QQQ',  name: 'Big Tech 100 Fund',           price: 480, sectors: ['tech', 'comm'], members: 30 },
  { ticker: 'DIA',  name: 'Blue Chip 30 Fund',           price: 420, sectors: null,   members: 30, mode: 'price' },
  { ticker: 'IWM',  name: 'Small Cap 2000 Fund',         price: 220, sectors: null,   members: 40, mode: 'small' },
  { ticker: 'VTI',  name: 'Total Market Fund',           price: 280, sectors: null,   members: 50 },
  { ticker: 'XLK',  name: 'Technology Sector Fund',      price: 230, sectors: ['tech'], members: 25 },
  { ticker: 'XLE',  name: 'Energy Sector Fund',          price: 90,  sectors: ['enrg'], members: 20 },
  { ticker: 'XLF',  name: 'Financials Sector Fund',      price: 45,  sectors: ['fin'],  members: 25 },
  { ticker: 'XLV',  name: 'Healthcare Sector Fund',      price: 145, sectors: ['hlth'], members: 25 },
  { ticker: 'VNQ',  name: 'Real Estate Fund',            price: 95,  sectors: ['reit'], members: 20 },
];
