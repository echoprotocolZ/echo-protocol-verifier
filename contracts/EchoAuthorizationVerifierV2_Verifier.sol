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

contract Groth16Verifier {
    // Scalar field size
    uint256 constant r    = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    // Base field size
    uint256 constant q   = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    // Verification Key data
    uint256 constant alphax  = 6939009978549923454010620615716846230821472772044868524663431376644954272778;
    uint256 constant alphay  = 11300475856452406187663546995177391705877900415850033277864437380009120940502;
    uint256 constant betax1  = 18001254997303805305490228393325528570107305455136575366421558189958916545175;
    uint256 constant betax2  = 17414882750599601155733248971443938135327287902107532276465235735684585650124;
    uint256 constant betay1  = 10267245587789672982220908022726332821070636352275626195183107008947716912475;
    uint256 constant betay2  = 10368549172623075008976191273900720040888531412365171262284643925258249876716;
    uint256 constant gammax1 = 11559732032986387107991004021392285783925812861821192530917403151452391805634;
    uint256 constant gammax2 = 10857046999023057135944570762232829481370756359578518086990519993285655852781;
    uint256 constant gammay1 = 4082367875863433681332203403145435568316851327593401208105741076214120093531;
    uint256 constant gammay2 = 8495653923123431417604973247489272438418190587263600148770280649306958101930;
    uint256 constant deltax1 = 11693434816738941672958692015022714721220919587185673772392528673553525603525;
    uint256 constant deltax2 = 11854974900414285138215424598400058283108036569387856488002237818238311543405;
    uint256 constant deltay1 = 723140249730240259784631070495944501208812104440136970554696906990878975060;
    uint256 constant deltay2 = 1562190973293236590086513997920931747284441256163748877729537447292945395495;

    
    uint256 constant IC0x = 3081264917322404457013674976602058986610996525829233457453407577741786590387;
    uint256 constant IC0y = 17286873175527635367309933242832387901775325888651578177056875657212831894866;
    
    uint256 constant IC1x = 16822303920211536706329668780207087401757943487163509880486668918767542396808;
    uint256 constant IC1y = 16538901689671683876044779537093430437523225595715672928462331830974417114643;
    
    uint256 constant IC2x = 18915991677427967709770343262375267093760456343165720847296410710531959539674;
    uint256 constant IC2y = 1865229314900249201674279178724506684809180383005352594011013220604687292454;
    
    uint256 constant IC3x = 18319892348958940541543415183180888392392055342368328191767247396229688127818;
    uint256 constant IC3y = 6981693165820718313299006978084978705228948782530902490031944941420296582019;
    
    uint256 constant IC4x = 16499128443762323020230206690223962955037830378467993244019238128830210859815;
    uint256 constant IC4y = 9582707766773916499274291865511220573564675361193000887006119108060079301554;
    
    uint256 constant IC5x = 18494755967665662891386917654945979399516186159854167352742243580026833363092;
    uint256 constant IC5y = 9756220658904416972349795125388915040336378243504337927011472182276291042322;
    
    uint256 constant IC6x = 1010852808016533340847352760908233417775836902847477376632909635481891370898;
    uint256 constant IC6y = 197079757157205727976711497634290178006561780825158544679977999843301393692;
    
    uint256 constant IC7x = 1908168474375169213406923451467899775631958618903255024358797881205913873138;
    uint256 constant IC7y = 18895390700824268470737231894623344806971975508399218193794555026192731044432;
    
    uint256 constant IC8x = 10310925600975640118367369192193126158991408787166750346510259343438612450150;
    uint256 constant IC8y = 20502217526837185294641621586589473438361651099963133871269055861468832536326;
    
    uint256 constant IC9x = 16189455624857026767266019506868134588092906155143366744780458714536523957229;
    uint256 constant IC9y = 9351463972819998610914250061311118371491264072283603854037972969212376405614;
    
    uint256 constant IC10x = 8235340506291078133468338700717578258593130329185039756477782715370221920653;
    uint256 constant IC10y = 14396527920636351788957446334110554424077582066858486170254926522594520395826;
    
    uint256 constant IC11x = 19421038539561838087222340745943740430393226462403854260143081996164629781475;
    uint256 constant IC11y = 11788537856506630898383933867699855317518261523161971574973422771261103003618;
    
    uint256 constant IC12x = 2877908060225216758386676322348669787904325052030604864620930639333511945866;
    uint256 constant IC12y = 3801408626465167787094040784932667411523948010275879098720836842004227710296;
    
    uint256 constant IC13x = 9280245041243188777052645673935329062148484892062758521766105802403014274442;
    uint256 constant IC13y = 6333502863435420656964426181233246893716546545388488607205514905351237922694;
    
    uint256 constant IC14x = 15151565388242496010341287058955104264500940766875563254083811105770511252055;
    uint256 constant IC14y = 11272371990235814613630448083262739268027987401251048139476710827494715553081;
    
    uint256 constant IC15x = 15461993368642658872087936386434000779708904515454749974303681624656592325662;
    uint256 constant IC15y = 21799579861870717629643287618442636675877907211229038250406646491027654153624;
    
    uint256 constant IC16x = 4943387944346271921772770809202135470930130986429639546109223663586051033134;
    uint256 constant IC16y = 16638978869716193963449569170700591827156494134924773199221001671283790311451;
    
    uint256 constant IC17x = 19922944794443133057647336438792371060845582869873732218621031379728639887710;
    uint256 constant IC17y = 7571970508101390805328275680375254861297699369111687010541352043096142267717;
    
 
    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[17] calldata _pubSignals) public view returns (bool) {
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
            

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }
 }
