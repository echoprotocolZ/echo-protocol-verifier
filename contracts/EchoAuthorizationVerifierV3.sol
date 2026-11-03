// SPDX-License-Identifier: GPL-3.0
/*
    Copyright 2021 0KIMS association.

    This file is generated with [snarkJS](https://github.com/iden3/snarkjs).

    snarkJS is a free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    snarkJS is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
    or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public
    License for more details.

    You should have received a copy of the GNU General Public License
    along with snarkJS. If not, see <https://www.gnu.org/licenses/>.
*/

pragma solidity >=0.7.0 <0.9.0;

contract EchoAuthorizationVerifierV3 {
    // Scalar field size
    uint256 constant r    = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    // Base field size
    uint256 constant q   = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    // Verification Key data
    uint256 constant alphax  = 7186540802139650956367233637231899323651478370730214415293168905367072118449;
    uint256 constant alphay  = 21182052862576006399248487060675236292937035326385500306131251845002813926845;
    uint256 constant betax1  = 1596610679608311559279060445688300865588023164613975372697026202221857506310;
    uint256 constant betax2  = 21239197417452681982056135995807255170705234372155311495597432180625616159070;
    uint256 constant betay1  = 20096775966050245059470799437283892873069006685626837401976335399008616714000;
    uint256 constant betay2  = 17661776803096712334328800898439609779957642523021171086508438781830067469067;
    uint256 constant gammax1 = 11559732032986387107991004021392285783925812861821192530917403151452391805634;
    uint256 constant gammax2 = 10857046999023057135944570762232829481370756359578518086990519993285655852781;
    uint256 constant gammay1 = 4082367875863433681332203403145435568316851327593401208105741076214120093531;
    uint256 constant gammay2 = 8495653923123431417604973247489272438418190587263600148770280649306958101930;
    uint256 constant deltax1 = 10643642234869607920728570833276254620864543026232343137596912043582484460761;
    uint256 constant deltax2 = 4208809908603170465309624971979067446212360137705993855592227744535528345118;
    uint256 constant deltay1 = 7533141851180176127725867824722569803279988032324293750921127658080185642726;
    uint256 constant deltay2 = 429167494496026112220415168024337657492814167050261166629443230394970812339;

    
    uint256 constant IC0x = 16528112551255149516729114947227755895873622394614541187194449428272776247433;
    uint256 constant IC0y = 20862542837970750463988902617049291484984299578279217993283495488715351678712;
    
    uint256 constant IC1x = 4958001659749670971915042401045021055404888053721926739978732920307522744054;
    uint256 constant IC1y = 9964326144441327003977239068545345157960909075444496583736652592113994855125;
    
    uint256 constant IC2x = 5552700622918506675024237686592130557975343461795939704197226999693157131538;
    uint256 constant IC2y = 20809844857571125143493329576690589989524695643663683977045181575103583710916;
    
    uint256 constant IC3x = 2786516459348381113420848868263146379277818776754824316666112405552540115610;
    uint256 constant IC3y = 10898138976720042664127394903034663112310330073860245319350242028016837738641;
    
    uint256 constant IC4x = 312285356266384612985528770854419346200848803517058759320837276269263596613;
    uint256 constant IC4y = 2616473366235946670816715196559274630638475090272696417350324106600698459050;
    
    uint256 constant IC5x = 20476009095034057658116374498893586354892633512253102795826249605485205993028;
    uint256 constant IC5y = 12859448823878433303461376116595713871312537451261042997337217961446476300669;
    
    uint256 constant IC6x = 8312608631445070076412359964234866831058535868002305152129249423012103046505;
    uint256 constant IC6y = 9411898874225731029530955861877426944577701558291591903814391987744119119039;
    
    uint256 constant IC7x = 16110503366954207027713301219787103136081804719687168577989942983109118170397;
    uint256 constant IC7y = 21277429774216042526091724126859678763012376505015546101416918697590774691058;
    
    uint256 constant IC8x = 17474841906929861236699367824266904954022998531791673551500294968598202384002;
    uint256 constant IC8y = 16765846154619815737981414192175034865577583434622691608765736296577329302318;
    
    uint256 constant IC9x = 21558423995342269634948955620795044192488347245727792292778992865207585511733;
    uint256 constant IC9y = 20365622420655671085397292881668391399833046623187805273368540891911820527476;
    
    uint256 constant IC10x = 6875639226813366223451834526585581501404807352424528979258371045129897556561;
    uint256 constant IC10y = 18582214931559933494207135570144346597170802676444242882099645403530728103552;
    
    uint256 constant IC11x = 3386317386540515153877248471357501254306312539893666401278179816521918076787;
    uint256 constant IC11y = 3028547806107542170154652825459110447423197774620020323049284992392709017441;
    
    uint256 constant IC12x = 10432859955027663161110293975614369964980744507183455796070919690280945091835;
    uint256 constant IC12y = 13086101560571471011620267307113342634318824003639504527882408545160414699788;
    
    uint256 constant IC13x = 8597205623403721033321870592192720552682035714000870357136768103411411033915;
    uint256 constant IC13y = 376029327160126564891675793431998294823604352558254860843403223806735495560;
    
    uint256 constant IC14x = 12344736252287126813882830105967998613487055556917572249764899117256086921638;
    uint256 constant IC14y = 5964972630886800003161893309470952899030580542192292747575560592148432685468;
    
    uint256 constant IC15x = 3909788205173417477788408811342428421176006128669202534136667756923207657068;
    uint256 constant IC15y = 4384564605667789215927035442040142769623253360140242233149120720510974578803;
    
    uint256 constant IC16x = 11600280716922847542061449003530481919562012648922263988307442534686119300615;
    uint256 constant IC16y = 14585185502610439359544022269176029158532492536932951611545930645869822609273;
    
    uint256 constant IC17x = 7784075078434104159712554860811281465604484743126219667983750381838270858988;
    uint256 constant IC17y = 7392664627676179802536027081642142888410984202131270762891098108761402581668;
    
    uint256 constant IC18x = 8892828917901963473332871049248166879134628079753647906678099636424270782999;
    uint256 constant IC18y = 15512684221321512999586020172856070485630628656392424059849713338598852679335;
    
    uint256 constant IC19x = 2325085981004718601722860684461660676416791690707192809135797278132576394841;
    uint256 constant IC19y = 41039299796299835168018658746989972689362160475981719832973730428937939597;
    
 
    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[19] calldata _pubSignals) public view returns (bool) {
        assembly {
            function checkField(v) {
                if iszero(lt(v, r)) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }
            
            // G1 function to multiply a G1 value(x,y) to value in an address
            function g1_mulAccC(pR, x, y, s) {
                let success
                let mIn := mload(0x40)
                mstore(mIn, x)
                mstore(add(mIn, 32), y)
                mstore(add(mIn, 64), s)

                success := staticcall(sub(gas(), 2000), 7, mIn, 96, mIn, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }

                mstore(add(mIn, 64), mload(pR))
                mstore(add(mIn, 96), mload(add(pR, 32)))

                success := staticcall(sub(gas(), 2000), 6, mIn, 128, pR, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }

            function checkPairing(pA, pB, pC, pubSignals, pMem) -> isOk {
                let _pPairing := add(pMem, pPairing)
                let _pVk := add(pMem, pVk)

                mstore(_pVk, IC0x)
                mstore(add(_pVk, 32), IC0y)

                // Compute the linear combination vk_x
                
                g1_mulAccC(_pVk, IC1x, IC1y, calldataload(add(pubSignals, 0)))
                
                g1_mulAccC(_pVk, IC2x, IC2y, calldataload(add(pubSignals, 32)))
                
                g1_mulAccC(_pVk, IC3x, IC3y, calldataload(add(pubSignals, 64)))
                
                g1_mulAccC(_pVk, IC4x, IC4y, calldataload(add(pubSignals, 96)))
                
                g1_mulAccC(_pVk, IC5x, IC5y, calldataload(add(pubSignals, 128)))
                
                g1_mulAccC(_pVk, IC6x, IC6y, calldataload(add(pubSignals, 160)))
                
                g1_mulAccC(_pVk, IC7x, IC7y, calldataload(add(pubSignals, 192)))
                
                g1_mulAccC(_pVk, IC8x, IC8y, calldataload(add(pubSignals, 224)))
                
                g1_mulAccC(_pVk, IC9x, IC9y, calldataload(add(pubSignals, 256)))
                
                g1_mulAccC(_pVk, IC10x, IC10y, calldataload(add(pubSignals, 288)))
                
                g1_mulAccC(_pVk, IC11x, IC11y, calldataload(add(pubSignals, 320)))
                
                g1_mulAccC(_pVk, IC12x, IC12y, calldataload(add(pubSignals, 352)))
                
                g1_mulAccC(_pVk, IC13x, IC13y, calldataload(add(pubSignals, 384)))
                
                g1_mulAccC(_pVk, IC14x, IC14y, calldataload(add(pubSignals, 416)))
                
                g1_mulAccC(_pVk, IC15x, IC15y, calldataload(add(pubSignals, 448)))
                
                g1_mulAccC(_pVk, IC16x, IC16y, calldataload(add(pubSignals, 480)))
                
                g1_mulAccC(_pVk, IC17x, IC17y, calldataload(add(pubSignals, 512)))
                
                g1_mulAccC(_pVk, IC18x, IC18y, calldataload(add(pubSignals, 544)))
                
                g1_mulAccC(_pVk, IC19x, IC19y, calldataload(add(pubSignals, 576)))
                

                // -A
                mstore(_pPairing, calldataload(pA))
                mstore(add(_pPairing, 32), mod(sub(q, calldataload(add(pA, 32))), q))

                // B
                mstore(add(_pPairing, 64), calldataload(pB))
                mstore(add(_pPairing, 96), calldataload(add(pB, 32)))
                mstore(add(_pPairing, 128), calldataload(add(pB, 64)))
                mstore(add(_pPairing, 160), calldataload(add(pB, 96)))

                // alpha1
                mstore(add(_pPairing, 192), alphax)
                mstore(add(_pPairing, 224), alphay)

                // beta2
                mstore(add(_pPairing, 256), betax1)
                mstore(add(_pPairing, 288), betax2)
                mstore(add(_pPairing, 320), betay1)
                mstore(add(_pPairing, 352), betay2)

                // vk_x
                mstore(add(_pPairing, 384), mload(add(pMem, pVk)))
                mstore(add(_pPairing, 416), mload(add(pMem, add(pVk, 32))))


                // gamma2
                mstore(add(_pPairing, 448), gammax1)
                mstore(add(_pPairing, 480), gammax2)
                mstore(add(_pPairing, 512), gammay1)
                mstore(add(_pPairing, 544), gammay2)

                // C
                mstore(add(_pPairing, 576), calldataload(pC))
                mstore(add(_pPairing, 608), calldataload(add(pC, 32)))

                // delta2
                mstore(add(_pPairing, 640), deltax1)
                mstore(add(_pPairing, 672), deltax2)
                mstore(add(_pPairing, 704), deltay1)
                mstore(add(_pPairing, 736), deltay2)


                let success := staticcall(sub(gas(), 2000), 8, _pPairing, 768, _pPairing, 0x20)

                isOk := and(success, mload(_pPairing))
            }

            let pMem := mload(0x40)
            mstore(0x40, add(pMem, pLastMem))

            // Validate that all evaluations ∈ F
            
            checkField(calldataload(add(_pubSignals, 0)))
            
            checkField(calldataload(add(_pubSignals, 32)))
            
            checkField(calldataload(add(_pubSignals, 64)))
            
            checkField(calldataload(add(_pubSignals, 96)))
            
            checkField(calldataload(add(_pubSignals, 128)))
            
            checkField(calldataload(add(_pubSignals, 160)))
            
            checkField(calldataload(add(_pubSignals, 192)))
            
            checkField(calldataload(add(_pubSignals, 224)))
            
            checkField(calldataload(add(_pubSignals, 256)))
            
            checkField(calldataload(add(_pubSignals, 288)))
            
            checkField(calldataload(add(_pubSignals, 320)))
            
            checkField(calldataload(add(_pubSignals, 352)))
            
            checkField(calldataload(add(_pubSignals, 384)))
            
            checkField(calldataload(add(_pubSignals, 416)))
            
            checkField(calldataload(add(_pubSignals, 448)))
            
            checkField(calldataload(add(_pubSignals, 480)))
            
            checkField(calldataload(add(_pubSignals, 512)))
            
            checkField(calldataload(add(_pubSignals, 544)))
            
            checkField(calldataload(add(_pubSignals, 576)))
            

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }
 }
