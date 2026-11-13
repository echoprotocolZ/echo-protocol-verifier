// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
contract EchoAlwaysRevert {
    error DeliberateFailure();
    function fail() external pure { revert DeliberateFailure(); }
}
